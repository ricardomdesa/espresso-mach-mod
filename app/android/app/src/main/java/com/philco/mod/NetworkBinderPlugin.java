package com.philco.mod;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Prende os sockets do app à interface Wi-Fi.
 *
 * A máquina roda um AP sem saída para a internet. O Android detecta isso,
 * rebaixa a rede e manda todo o tráfego do processo para os dados móveis —
 * e pode até desconectar do AP sozinho. O resultado é que
 * http://192.168.4.1 sai pela operadora e nunca chega no ESP32.
 *
 * requestNetwork() com TRANSPORT_WIFI diz ao sistema que ESTE app quer a
 * Wi-Fi mesmo sem internet (o que também segura a conexão de pé), e
 * bindProcessToNetwork() faz o WebView usá-la.
 */
@CapacitorPlugin(name = "NetworkBinder")
public class NetworkBinderPlugin extends Plugin {

    private static final String TAG = "NetworkBinder";

    private final Handler handler = new Handler(Looper.getMainLooper());

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback callback;

    /**
     * Incrementado a cada unbind()/handleOnDestroy() (e a cada novo bind()).
     * Um retry agendado só executa o rebind se ainda estiver na mesma geração;
     * caso contrário, o plugin/activity já foi destruído ou um novo bind foi
     * iniciado, e o Runnable atrasado vira um no-op.
     */
    private volatile int generation = 0;

    /** Evita que onAvailable e onCapabilitiesChanged disparem retries em paralelo. */
    private volatile boolean retryInFlight = false;

    @PluginMethod
    public void bind(PluginCall call) {
        final ConnectivityManager cm = manager();
        if (cm == null) {
            call.reject("ConnectivityManager indisponivel");
            return;
        }

        releaseCallback();
        cancelPendingRetries();

        NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build();

        callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                Log.i(TAG, "Wi-Fi disponivel: " + network + " caps="
                        + cm.getNetworkCapabilities(network));
                bindWithRetry(cm, network, 5, generation);
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                // Uma rede sem internet só ganha as capacidades finais depois da
                // sondagem do sistema; até lá o bind pode ser recusado.
                // Só inicia uma cadeia de retry se nenhuma já estiver em andamento
                // (evita sobrepor com a cadeia de onAvailable quando há mais de
                // uma rede Wi-Fi visível).
                if (cm.getBoundNetworkForProcess() == null && !retryInFlight) {
                    bindWithRetry(cm, network, 3, generation);
                }
            }

            @Override
            public void onLost(Network network) {
                // Só desfaz o bind se a rede perdida for a que está de fato
                // vinculada ao processo; caso contrário seria derrubar um bind
                // válido por causa de uma rede stale/irrelevante.
                if (network.equals(cm.getBoundNetworkForProcess())) {
                    Log.i(TAG, "Wi-Fi perdida, desfazendo o bind");
                    cm.bindProcessToNetwork(null);
                } else {
                    Log.i(TAG, "Wi-Fi perdida (nao era a rede vinculada), ignorando: " + network);
                }
            }
        };

        try {
            cm.requestNetwork(request, callback);
        } catch (SecurityException e) {
            callback = null;
            call.reject("Sem permissao CHANGE_NETWORK_STATE", e);
            return;
        }

        JSObject result = new JSObject();
        result.put("requested", true);
        call.resolve(result);
    }

    /**
     * Diagnóstico para a tela de conexão explicar por que a máquina não responde.
     * Uma VPN ativa com bypassable=false captura todo o tráfego do app e nem
     * o bind escapa dela — é preciso desligá-la.
     */
    @PluginMethod
    public void status(PluginCall call) {
        ConnectivityManager cm = manager();
        JSObject result = new JSObject();
        if (cm == null) {
            call.reject("ConnectivityManager indisponivel");
            return;
        }

        boolean vpnActive = false;
        boolean wifiAvailable = false;
        for (Network network : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(network);
            if (caps == null) continue;
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) vpnActive = true;
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) wifiAvailable = true;
        }

        result.put("vpnActive", vpnActive);
        result.put("wifiAvailable", wifiAvailable);
        result.put("bound", cm.getBoundNetworkForProcess() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void unbind(PluginCall call) {
        ConnectivityManager cm = manager();
        if (cm != null) {
            cm.bindProcessToNetwork(null);
        }
        releaseCallback();
        cancelPendingRetries();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        ConnectivityManager cm = manager();
        if (cm != null) {
            cm.bindProcessToNetwork(null);
        }
        releaseCallback();
        cancelPendingRetries();
    }

    /**
     * Invalida qualquer retry de bind agendado (via geração) e limpa o Handler,
     * para que um Runnable atrasado não reative o bind depois que o plugin/
     * activity já foi desfeito.
     */
    private void cancelPendingRetries() {
        generation++;
        retryInFlight = false;
        handler.removeCallbacksAndMessages(null);
    }

    /**
     * O bind pode ser recusado enquanto o sistema ainda está validando a rede.
     * Tenta de novo algumas vezes antes de desistir.
     *
     * @param startGeneration geração do plugin no momento em que esta cadeia de
     *                        retry começou; se um unbind()/handleOnDestroy() (ou
     *                        um novo bind()) mudar a geração enquanto um retry
     *                        está agendado, o Runnable atrasado vira um no-op.
     */
    private void bindWithRetry(final ConnectivityManager cm, final Network network,
                              final int attemptsLeft, final int startGeneration) {
        if (startGeneration != generation) {
            // Plugin desfeito ou um novo bind foi iniciado desde o agendamento.
            return;
        }
        retryInFlight = true;
        if (cm.bindProcessToNetwork(network)) {
            Log.i(TAG, "bind do processo OK em " + network);
            retryInFlight = false;
            return;
        }
        if (attemptsLeft <= 0) {
            Log.w(TAG, "bind do processo falhou em " + network);
            retryInFlight = false;
            return;
        }
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                bindWithRetry(cm, network, attemptsLeft - 1, startGeneration);
            }
        }, 400);
    }

    private ConnectivityManager manager() {
        if (connectivityManager == null && getContext() != null) {
            connectivityManager = (ConnectivityManager)
                    getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        }
        return connectivityManager;
    }

    private void releaseCallback() {
        if (callback == null) return;
        try {
            manager().unregisterNetworkCallback(callback);
        } catch (IllegalArgumentException ignored) {
            // já removido
        }
        callback = null;
    }
}
