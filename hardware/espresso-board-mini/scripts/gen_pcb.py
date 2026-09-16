import uuid, copy
from kiutils.footprint import Footprint, Pad, DrillDefinition
from kiutils.items.common import Position, Net as CNet, Effects, Font
from kiutils.items.fpitems import FpLine, FpText, FpCircle, FpPoly
from kiutils.items.brditems import Segment
from kiutils.items.gritems import GrRect, GrLine

def u():
    return str(uuid.uuid4())

FPLIB = "/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints"

# ============================================================
# 1. Custom ESP32-C3 Super Mini footprint (2x8 THT, 2.54mm pitch,
#    17.78mm row spacing). Board frame: no Y-flip (verified against
#    a minimal test board + kicad-cli DRC: 0 unconnected pads when
#    abs = instance.position + local_pad_position, no rotation math
#    needed since everything here is placed at angle 0).
# ============================================================
LEFT_PINS = ["5V", "GND", "3V3", "GPIO4", "GPIO3", "GPIO2", "GPIO1", "GPIO0"]
RIGHT_PINS = ["GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"]

def make_esp32_footprint():
    fp = Footprint()
    fp.libId = "ESP32C3_SuperMini:ESP32C3_SuperMini_2x8_P2.54mm"
    fp.version = "20260206"
    fp.generator = "espresso-board-mini-gen"
    fp.layer = "F.Cu"
    fp.description = "ESP32-C3 Super Mini dev board, 2x8 THT header 2.54mm pitch, 17.78mm row spacing"
    fp.tags = "ESP32 ESP32-C3 SuperMini"

    ROW_SPACING = 17.78
    PIN_PITCH = 2.54
    y0 = 0.0  # pin 1 (top-left, 5V) at local (x,y)=(0,0)

    for i, name in enumerate(LEFT_PINS):
        y = y0 + i * PIN_PITCH
        pad = Pad(number=str(i + 1), type="thru_hole",
                   shape="rect" if i == 0 else "circle",
                   position=Position(0, y, 0), size=Position(1.7, 1.7),
                   drill=DrillDefinition(diameter=1.0),
                   layers=["*.Cu", "*.Mask"])
        pad.pinFunction = name
        fp.pads.append(pad)

    for i, name in enumerate(RIGHT_PINS):
        y = y0 + i * PIN_PITCH
        pad = Pad(number=str(i + 9), type="thru_hole", shape="circle",
                   position=Position(ROW_SPACING, y, 0), size=Position(1.7, 1.7),
                   drill=DrillDefinition(diameter=1.0),
                   layers=["*.Cu", "*.Mask"])
        pad.pinFunction = name
        fp.pads.append(pad)

    # silkscreen outline approximating the module body (~20.3mm x 22.9mm),
    # centered around the pin field
    margin_x = 1.27
    margin_y_top = 2.5   # extra room for the USB-C connector end
    margin_y_bot = 2.5
    x0, x1 = -margin_x, ROW_SPACING + margin_x
    y_top = y0 - margin_y_top
    y_bot = y0 + (len(LEFT_PINS) - 1) * PIN_PITCH + margin_y_bot
    fp.graphicItems.append(FpLine(start=Position(x0, y_top), end=Position(x1, y_top), layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x1, y_top), end=Position(x1, y_bot), layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x1, y_bot), end=Position(x0, y_bot), layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x0, y_bot), end=Position(x0, y_top), layer="F.SilkS", width=0.15, tstamp=u()))
    # USB-C marker notch on the top edge (small rectangle centered in X)
    cx = ROW_SPACING / 2
    fp.graphicItems.append(FpLine(start=Position(cx - 3, y_top), end=Position(cx - 3, y_top + 1.2), layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(cx + 3, y_top), end=Position(cx + 3, y_top + 1.2), layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(cx - 3, y_top + 1.2), end=Position(cx + 3, y_top + 1.2), layer="F.SilkS", width=0.15, tstamp=u()))
    # pin-1 marker: small silkscreen circle near pad 1
    fp.graphicItems.append(FpCircle(center=Position(-0.9, -0.9), end=Position(-0.6, -0.9),
                                     layer="F.SilkS", fill="solid", width=0.15, tstamp=u()))
    # courtyard
    fp.graphicItems.append(FpLine(start=Position(x0 - 0.25, y_top - 0.25), end=Position(x1 + 0.25, y_top - 0.25), layer="F.CrtYd", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x1 + 0.25, y_top - 0.25), end=Position(x1 + 0.25, y_bot + 0.25), layer="F.CrtYd", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x1 + 0.25, y_bot + 0.25), end=Position(x0 - 0.25, y_bot + 0.25), layer="F.CrtYd", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(x0 - 0.25, y_bot + 0.25), end=Position(x0 - 0.25, y_top - 0.25), layer="F.CrtYd", width=0.15, tstamp=u()))

    fp.graphicItems.append(FpText(type="reference", text="REF**", position=Position(cx, y_top - 1.2, 0),
                                   layer="F.SilkS", effects=Effects(font=Font(width=1.0, height=1.0))))
    fp.graphicItems.append(FpText(type="value", text=fp.entryName, position=Position(cx, y_bot + 1.2, 0),
                                   layer="F.Fab", effects=Effects(font=Font(width=1.0, height=1.0))))
    return fp


# ============================================================
# 2. Netlist (derived from espresso-board-mini.kicad_sch: which pins
#    share a LocalLabel name or a power-symbol value)
# ============================================================
NETS = {
    "GND":        [("U1","2"), ("SW1","2"), ("Q1","3"), ("J4","2"), ("R2","2"),
                    ("Q2","3"), ("J3","2"), ("J1","2"), ("J2","2"),
                    ("J5_GND","1"), ("J6_GND","1")],
    "+3V3":       [("U1","3"), ("J5_3V3","1"), ("J6_3V3","1")],
    "BTN_GPIO3":  [("U1","5"), ("SW1","1")],
    "READY_GPIO1":[("U1","7"), ("J2","1")],
    "PUMP_GPIO0": [("U1","8"), ("J1","1")],
    "THERMO_SCK": [("U1","9"), ("J5_SCK","1")],
    "THERMO_SO":  [("U1","10"), ("J5_SO","1")],
    "THERMO_CS":  [("U1","11"), ("J5_CS","1")],
    "OLED_SDA":   [("U1","12"), ("J6_SDA","1")],
    "OLED_SCL":   [("U1","13"), ("J6_SCL","1")],
    "SSR_ACT_GPIO10": [("U1","14"), ("R3","1")],
    "LED_ACT_GPIO20": [("U1","15"), ("R4","1")],
    "Q1_BASE":    [("R4","2"), ("Q1","2")],
    "LED_CATHODE":[("Q1","1"), ("J4","1")],
    "Q2_BASE":    [("R3","2"), ("R2","1"), ("Q2","1")],
    "SSR_MINUS":  [("Q2","2"), ("J3","1")],
}
net_names_ordered = list(NETS.keys())
NET_NUM = {name: i + 1 for i, name in enumerate(net_names_ordered)}
PAD_NET = {}
for name, pads in NETS.items():
    for ref, pad in pads:
        PAD_NET[(ref, pad)] = name

def make_wire_pad_connector(n, pitch, name):
    """Custom N-pad, single-row THT footprint at a wider-than-standard pitch.
    Since this board is hand-wired (copper tape + soldered leads, not mated
    to a real pin-header part), the connectors don't need 2.54mm spacing --
    a wider pitch gives routing room to breathe around each pad."""
    fp = Footprint()
    fp.libId = f"WirePads:{name}"
    fp.layer = "F.Cu"
    fp.description = f"{n}-pad hand-wire connector, {pitch}mm pitch"
    for i in range(n):
        pad = Pad(number=str(i + 1), type="thru_hole", shape="rect" if i == 0 else "circle",
                   position=Position(0, i * pitch, 0), size=Position(2.0, 2.0),
                   drill=DrillDefinition(diameter=1.0), layers=["*.Cu", "*.Mask"])
        fp.pads.append(pad)
    fp.graphicItems.append(FpLine(start=Position(-1.5, -1.5), end=Position(1.5, -1.5),
                                   layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpLine(start=Position(-1.5, (n-1)*pitch+1.5), end=Position(1.5, (n-1)*pitch+1.5),
                                   layer="F.SilkS", width=0.15, tstamp=u()))
    fp.graphicItems.append(FpText(type="reference", text="REF**", position=Position(0, -3.5, 0),
                                   layer="F.SilkS", effects=Effects(font=Font(width=1.0, height=1.0))))
    fp.graphicItems.append(FpText(type="value", text=name, position=Position(0, (n-1)*pitch+3.5, 0),
                                   layer="F.Fab", effects=Effects(font=Font(width=1.0, height=1.0))))
    return fp

FOOTPRINT_FILES = {
    "Device:R": (FPLIB + "/Resistor_THT.pretty/R_Axial_DIN0204_L3.6mm_D1.6mm_P2.54mm_Vertical.kicad_mod",
                 "Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P2.54mm_Vertical"),
    "Switch:SW_Push": (FPLIB + "/Button_Switch_THT.pretty/SW_PUSH_6mm.kicad_mod",
                        "Button_Switch_THT:SW_PUSH_6mm"),
    "BC547": (FPLIB + "/Package_TO_SOT_THT.pretty/TO-92_Inline.kicad_mod",
              "Package_TO_SOT_THT:TO-92_Inline"),
    "TIP120": (FPLIB + "/Package_TO_SOT_THT.pretty/TO-220-3_Vertical.kicad_mod",
               "Package_TO_SOT_THT:TO-220-3_Vertical"),
    "Conn02": (FPLIB + "/Connector_PinHeader_2.54mm.pretty/PinHeader_1x02_P2.54mm_Vertical.kicad_mod",
               "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"),
    "Conn04": (FPLIB + "/Connector_PinHeader_2.54mm.pretty/PinHeader_1x04_P2.54mm_Vertical.kicad_mod",
               "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical"),
    "Conn05": (FPLIB + "/Connector_PinHeader_2.54mm.pretty/PinHeader_1x05_P2.54mm_Vertical.kicad_mod",
               "Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical"),
}

placed = {}   # ref -> Footprint instance
board_footprints = []

def place(ref, kind, value, pos, angle=0):
    if kind == "ESP32":
        fp = make_esp32_footprint()
    elif kind.startswith("WIRE"):
        n = int(kind[4:])
        fp = make_wire_pad_connector(n, 6.0, value)
    else:
        path, libid = FOOTPRINT_FILES[kind]
        fp = Footprint().from_file(path)
        fp.libId = libid
    fp.position = Position(pos[0], pos[1], angle)
    fp.tstamp = u()
    fp.layer = "F.Cu"
    # reference/value text
    fp.properties = {}
    for item in fp.graphicItems:
        if isinstance(item, FpText) and item.type == "reference":
            item.text = ref
        if isinstance(item, FpText) and item.type == "value":
            item.text = value
    for pad in fp.pads:
        net_name = PAD_NET.get((ref, pad.number))
        if net_name:
            pad.net = CNet(NET_NUM[net_name], net_name)
    placed[ref] = fp
    board_footprints.append(fp)
    return fp

def pad_abs(ref, pad_number):
    fp = placed[ref]
    import math
    a = math.radians(fp.position.angle or 0)
    for pad in fp.pads:
        if pad.number == str(pad_number):
            lx, ly = pad.position.X, pad.position.Y
            rx = lx * math.cos(a) - ly * math.sin(a)
            ry = lx * math.sin(a) + ly * math.cos(a)
            return (round(fp.position.X + rx, 3), round(fp.position.Y + ry, 3))
    raise KeyError((ref, pad_number))


# ============================================================
# 3. Placement. Board: 50mm wide x ~105mm long, single copper layer on
#    B.Cu (components mount on the front/top, copper tape is glued to the
#    back/bottom; through-hole leads connect front to back, so pad layers
#    stay the *.Cu wildcard -- only track segments move to B.Cu).
#
#    New fabrication parameters (changed from an earlier version of this
#    file): track width 2.0mm, clearance 0.5mm (0.5mm-deep/wide groove
#    printed into the part, tape glued over it, cut along the groove edge
#    with a hobby knife -- 1.5mm copper was too thin to knife-cut reliably
#    by hand). Minimum safe pitch between different-net copper is
#    2.0+0.5=2.5mm.
#
#    ESP32-C3 pin pitch is 2.54mm -- only 0.04mm margin at 2.5mm minimum
#    pitch, not real-world safe. Every net leaving U1 uses a THIN 1.0mm
#    lead (1.0+0.5=1.5mm pitch, real margin) for its entire run while it
#    could still be running parallel/close to a neighboring pin's own
#    exit trace (i.e. the whole first leg, not just a fixed "3mm stub" --
#    some of these run straight to their destination pad with no
#    divergence at all, so the whole hop has to stay thin).
#
#    BC547 (Q1) stock TO-92_Inline pads are 1.27mm pitch, too tight for any
#    tape-width trace to clear a neighbor. Per the user, Q1's 3 legs get
#    bent apart to standard 2.54mm pitch before soldering, so this
#    footprint's pads are respaced to 2.54mm right after placement (see
#    below) -- full 2.0mm tape traces reach every pad normally, no thin
#    bare-wire exception needed here anymore.
#
#    Layout is split by the GND spine (a single horizontal bus) into a
#    TOP zone (U1, left-side relay connectors, thermo/OLED signal pads,
#    thermo/OLED power pads, +3V3 trunk) and a BOTTOM zone immediately
#    below the spine holding both driver clusters SIDE BY SIDE (SSR on
#    the left, LED on the right) instead of stacked -- this is what
#    shrinks the board from an earlier 160mm down to ~105mm. Only
#    SSR_ACT_GPIO10 and LED_ACT_GPIO20 need to cross the spine (once
#    each, via a jumper); everything else in the bottom zone stays below
#    it and never crosses.
#
#    Footprint pad geometry (verified with a kiutils dump before writing
#    any of this): Device:R (R_Axial_..._Vertical) pad1=(0,0), pad2=
#    (2.54,0) -- SAME Y, offset in X. TIP120/BC547 the same idea, all pads
#    in one row (X offsets 0/2.54/5.08 and 0/1.27/2.54). Connector:Conn02
#    is the opposite: pad1=(0,0), pad2=(0,2.54) -- stacked in Y. A route
#    that needs to leave one pad toward somewhere not in line with a
#    footprint's other pads detours a few mm above/below that row rather
#    than cutting straight through it (grazes a same-footprint neighbor
#    pad on a different net otherwise) -- final approaches onto a pad are
#    always a straight shot along the row's perpendicular, never a sweep
#    across the row.
# ============================================================
BOARD_W = 50.0
BOARD_LEN = 105.0
SPINE_Y = 55.0
THIN = 1.0    # ESP32 fan-out lead width

place("U1", "ESP32", "ESP32C3_SuperMini", (16.11, 12.0))

place("SW1", "Switch:SW_Push", "SW_Push", (6.0, 20.0))
place("J1", "Conn02", "J_PUMP_RELE", (8.5, 40.0))  # x=8.5: >=2.35mm from GND's x=6 lane AND >=1.85mm from +3V3's thin x=10.5 lane (8 was too close to GND, 9 too close to +3V3)
place("J2", "Conn02", "J_READY_RELE", (20.0, 48.0))

# Each thermo/OLED SIGNAL gets its own individual hand-wire pad placed
# directly across from its own U1 row -- a single short hop, no long
# parallel run (this board is hand-wired: MAX6675/OLED module leads
# solder straight to these points, no rigid multi-pin header needed).
place("J5_SCK", "WIRE1", "THERMO_SCK", (40.0, 12.0))
place("J5_SO",  "WIRE1", "THERMO_SO",  (40.0, 14.54))
place("J5_CS",  "WIRE1", "THERMO_CS",  (40.0, 17.08))
place("J6_SDA", "WIRE1", "OLED_SDA",   (40.0, 19.62))
place("J6_SCL", "WIRE1", "OLED_SCL",   (40.0, 22.16))

# Thermo/OLED power pads, relocated up into the top zone (an earlier
# version put these far down near the bottom, wasting length).
place("J5_GND", "WIRE1", "J_THERMO_GND", (24.0, 38.0))
place("J6_GND", "WIRE1", "J_OLED_GND",   (24.0, 44.0))
place("J5_3V3", "WIRE1", "J_THERMO_3V3", (28.0, 38.0))
place("J6_3V3", "WIRE1", "J_OLED_3V3",   (28.0, 44.0))

# ---- SSR driver cluster: left half of the board, below the spine ----
place("R3", "Device:R", "1k", (15.0, 62.0))         # pad1=(15,62) pad2=(17.54,62)
place("Q2", "TIP120", "TIP120", (12.0, 72.0))       # pad1=(12,72)B pad2=(14.54,72)C pad3=(17.08,72)E
place("R2", "Device:R", "10k", (12.0, 87.0))        # pad1=(12,87) pad2=(14.54,87)
place("J3", "Conn02", "J_SSR", (9.0, 95.0))         # pad1=(9,95) pad2=(9,97.54)

# ---- LED driver cluster: right half of the board, below the spine,
# side by side with the SSR cluster (not stacked below it) ----
place("R4", "Device:R", "1k", (41.0, 62.0))         # pad1=(41,62) pad2=(43.54,62)
place("Q1", "BC547", "BC547", (38.0, 70.0))         # pad1=(38,70)C pad2=(40.54,70)B pad3=(43.08,70)E
# Legs bent to 2.54mm pitch before soldering (user call) -- respace this
# footprint's pads from the stock TO-92_Inline 1.27mm pitch accordingly.
for _pad in placed["Q1"].pads:
    _pad.position = Position(2.54 * (int(_pad.number) - 1), 0, 0)
place("J4", "Conn02", "J_LED", (41.0, 86.0))        # pad1=(41,86) pad2=(41,88.54)

# ============================================================
# 4. Routing. Every crossing is bridged by hand with an explicit jumper
#    footprint placed and verified individually (a fully automatic
#    patcher was tried in an earlier version and had edge-case bugs --
#    co-located jumper pads, tracks left half-connected).
# ============================================================
SEGMENTS = []  # each: {"net":.., "a":(x,y), "b":(x,y)}

def route(net, pts, width=None):
    pts = [tuple(p) for p in pts]
    for a, b in zip(pts[:-1], pts[1:]):
        if a == b:
            continue
        SEGMENTS.append({"net": net, "a": a, "b": b, "width": width})

def add_jumper(ref, center, pitch, net, axis):
    """A 2-pad wire-bridge footprint (hand-soldered bridge wire on the real
    board) spanning `pitch` mm across `center`, along `axis` ('h' or 'v').
    Returns the two pad absolute positions (near_a, near_b) so the caller's
    track can stop at each one instead of continuing through the crossing.
    Pitch must clear the crossed track's half-width + this pad's half-size
    + clearance on each side: 1.0(track/2) + 0.7(pad/2) + 0.5(clearance) =
    2.2mm minimum half-pitch -> 4.4mm minimum pitch; the default call sites
    below use 5.0mm for margin."""
    if axis == "h":
        pa = (center[0] - pitch / 2, center[1])
        pb = (center[0] + pitch / 2, center[1])
    else:
        pa = (center[0], center[1] - pitch / 2)
        pb = (center[0], center[1] + pitch / 2)
    fp = Footprint()
    fp.libId = "Jumper:SolderBridge_2Pad"
    fp.layer = "F.Cu"
    fp.position = Position(pa[0], pa[1], 0)
    fp.tstamp = u()
    fp.description = "Hand-soldered wire bridge (jumper) for single-layer routing"
    # The two pads are joined by an actual wire soldered across the top of
    # whatever track it crosses -- not by copper on this layer -- so there
    # is deliberately no track between them. net_tie_pad_groups tells DRC
    # that's intentional (both pads count as one connected island) instead
    # of flagging them as an open/unconnected net. kicad-cli's DRC still
    # reports each jumper pair as "unconnected_items" regardless (verified
    # empirically -- that check doesn't treat net-tie as satisfying
    # connectivity, though it does suppress shorting/clearance between
    # them) -- that is expected and means "hand-solder a wire here", not a
    # bug; don't chase it to zero.
    fp.netTiePadGroups = ["1, 2"]
    dx, dy = pb[0] - pa[0], pb[1] - pa[1]
    for i in range(2):
        pad = Pad(number=str(i + 1), type="thru_hole", shape="rect" if i == 0 else "circle",
                   position=Position(i * dx, i * dy, 0), size=Position(1.4, 1.4),
                   drill=DrillDefinition(diameter=0.7), layers=["*.Cu", "*.Mask"])
        pad.net = CNet(NET_NUM[net], net)
        fp.pads.append(pad)
    fp.graphicItems.append(FpText(type="reference", text=ref, position=Position(dx/2, dy/2 - 2.2, 0),
                                   layer="F.SilkS", effects=Effects(font=Font(width=0.8, height=0.8))))
    board_footprints.append(fp)
    return pa, pb

# ---- left side ----
route("READY_GPIO1", [pad_abs("U1","7"), (13.0, 27.24)], width=THIN)
route("READY_GPIO1", [(13.0, 27.24), (13.0, 48.0), pad_abs("J2","1")])

_bp, _bq = add_jumper("JB1", (10.5, 22.16), 5.0, "BTN_GPIO3", "h")  # crosses +3V3's vertical
route("BTN_GPIO3", [pad_abs("U1","5"), _bq], width=THIN)
route("BTN_GPIO3", [_bp, (6.0, 22.16)], width=THIN)
route("BTN_GPIO3", [(6.0, 22.16), (6.0, 20.0)], width=THIN)

# one wide jumper spans BOTH crossings on this leg (READY's vertical at
# x=13 and +3V3's vertical at x=10.5), same as a single soldered bridge
# wire hopping over two traces at once on the real board.
_pp, _pq = add_jumper("JB2", (11.8, 29.78), 7.0, "PUMP_GPIO0", "h")
route("PUMP_GPIO0", [pad_abs("U1","8"), _pq], width=THIN)
# jogs to x=8.5 (thin) for the long parallel run past SW1's GND drop
# (x=6) and +3V3's lane (x=10.5) -- at normal 2mm width this corridor is
# too narrow for all three; thin width fits with margin on both sides.
route("PUMP_GPIO0", [_pp, (8.5, 29.78)], width=THIN)
route("PUMP_GPIO0", [(8.5, 29.78), (8.5, 38.0)], width=THIN)
route("PUMP_GPIO0", [(8.5, 38.0), (8.5, 40.0)], width=THIN)
route("PUMP_GPIO0", [(8.5, 40.0), pad_abs("J1","1")])

# ---- right side: each thermo/OLED signal is one direct thin hop from
# its own U1 row straight to its own pad -- it never diverges from its
# neighbor rows before terminating, so the ENTIRE hop stays thin, not
# just an initial stub.
route("THERMO_SCK", [pad_abs("U1","9"),  pad_abs("J5_SCK","1")], width=THIN)
route("THERMO_SO",  [pad_abs("U1","10"), pad_abs("J5_SO","1")], width=THIN)
route("THERMO_CS",  [pad_abs("U1","11"), pad_abs("J5_CS","1")], width=THIN)
route("OLED_SDA",   [pad_abs("U1","12"), pad_abs("J6_SDA","1")], width=THIN)
route("OLED_SCL",   [pad_abs("U1","13"), pad_abs("J6_SCL","1")], width=THIN)

# ---- SSR_ACT_GPIO10 / LED_ACT_GPIO20: thin while exiting U1's tight
# pitch, turn to full width once they've reached their own dedicated
# lane (x=37 and x=44), then cross the GND spine once each via a jumper
# before reaching their respective (side-by-side) driver clusters. ----
_x1p, _x1q = add_jumper("JB3", (37.0, 27.24), 5.0, "LED_ACT_GPIO20", "h")  # crosses SSR_ACT_GPIO10's vertical
route("SSR_ACT_GPIO10", [pad_abs("U1","14"), (37.0, 24.7)], width=THIN)
route("LED_ACT_GPIO20", [pad_abs("U1","15"), _x1p], width=THIN)
route("LED_ACT_GPIO20", [_x1q, (44.0, 27.24)], width=THIN)

_sjp, _sjq = add_jumper("JBspine1", (37.0, SPINE_Y), 5.0, "SSR_ACT_GPIO10", "v")
route("SSR_ACT_GPIO10", [(37.0, 24.7), _sjp])
route("SSR_ACT_GPIO10", [_sjq, (37.0, 58.0), (15.0, 58.0), pad_abs("R3","1")])

_ljp, _ljq = add_jumper("JBspine2", (44.0, SPINE_Y), 5.0, "LED_ACT_GPIO20", "v")
route("LED_ACT_GPIO20", [(44.0, 27.24), _ljp])
# lane stays at x=44 (clear of the thermo/OLED signal pads at x=40) down
# to y=60, then jogs left to x=41 to reach R4 -- R4 itself is kept off
# x=44 so the LED cluster's local GND lane (x=47) has room to clear
# R4.pad2 by >=2.5mm without running off the board edge (50).
route("LED_ACT_GPIO20", [_ljq, (44.0, 58.0), (41.0, 58.0), pad_abs("R4","1")])

# ---- +3V3: exits U1 to the left (thin, its own lane x=10.5, between
# PUMP's x=8 and READY's x=13), runs down past the left connectors (below
# J2 at y=48 so it never has to cross READY's vertical), then right to
# reach J5_3V3/J6_3V3 -- crossing J2's and J5/J6_GND's GND drops with one
# combined jumper on the way. ----
# the whole trunk stays thin: it threads a narrow corridor (GND's x=6
# lane on one side, PUMP's x=8.5 lane on the other) for most of its run,
# and at normal 2mm width there isn't room in that corridor for all three.
route("+3V3", [pad_abs("U1","3"), (10.5, 17.08)], width=THIN)
route("+3V3", [(10.5, 17.08), (10.5, 52.7)], width=THIN)
_vp, _vq = add_jumper("JBv", (22.0, 52.7), 8.6, "+3V3", "h")  # spans J2's GND drop (x=20) and J5/J6_GND's drop (x=24)
route("+3V3", [(10.5, 52.7), _vp], width=THIN)
route("+3V3", [_vq, (28.0, 52.7)], width=THIN)
route("+3V3", [(28.0, 52.7), (28.0, 44.0), (28.0, 38.0)], width=THIN)

# ============================================================
# 5. GND: a horizontal spine at y=55 is the boundary between the top zone
#    (everything above drops DOWN to it) and the bottom zone (both driver
#    clusters below it, each with its own local GND lane that taps UP to
#    the spine once). ----
# ============================================================
route("GND", [(2.0, SPINE_Y), (48.0, SPINE_Y)])  # the spine itself

route("GND", [pad_abs("U1","2"), (3.0, 14.54)], width=THIN)
route("GND", [(3.0, 14.54), (3.0, SPINE_Y)])
route("GND", [pad_abs("SW1","2"), (6.0, SPINE_Y)])
route("GND", [pad_abs("J1","2"), (8.5, SPINE_Y)])
route("GND", [pad_abs("J2","2"), (20.0, SPINE_Y)])
route("GND", [pad_abs("J5_GND","1"), (24.0, SPINE_Y)])
route("GND", [pad_abs("J6_GND","1"), (24.0, SPINE_Y)])

# SW_PUSH_6mm models 2 physical legs per logical pin (both pad "1"
# instances are the same switch terminal, both pad "2" the other) -- on a
# real tactile switch these are joined by the switch's own metal frame,
# not by copper, so KiCad's DRC sees the second leg of each pin as its own
# unconnected island unless we draw a short link between them too. Both
# of these cross +3V3's vertical lane at x=10.5.
_wp1, _wq1 = add_jumper("JB11", (10.5, 20.0), 5.0, "BTN_GPIO3", "h")
route("BTN_GPIO3", [(6.0, 20.0), _wp1])
route("BTN_GPIO3", [_wq1, (12.5, 20.0)])

_wp2, _wq2 = add_jumper("JB12", (10.5, 24.5), 5.0, "GND", "h")
route("GND", [(6.0, 24.5), _wp2], width=THIN)
route("GND", [_wq2, (12.5, 24.5)])

# ---- SSR cluster local GND lane (x=5, left of everything in this
# cluster), taps the spine once at the top. ----
route("GND", [(5.0, SPINE_Y), (5.0, 100.0)])

# Q2.pad3(E): own level y=84 (kept well clear -- 7mm -- of JBg3 at y=77,
# which broke Q2_BASE right above). This leg crosses two things only 3mm
# apart on its way to the x=5 lane -- Q2_BASE at x=12 and SSR_MINUS at
# x=9 -- too close together for two separate jumpers (their pads and the
# short bridge between them ended up within 0.5mm of one or the other in
# an earlier version), so ONE wider jumper spans both at once, same as
# the PUMP_GPIO0 double-crossing jumper near U1.
_g1p, _g1q = add_jumper("JBg1", (10.5, 84.0), 8.0, "GND", "h")
route("GND", [pad_abs("Q2","3"), (17.08, 84.0), _g1q])
route("GND", [_g1p, (5.0, 84.0)])

# R2.pad2: own level y=91 (4mm below its own row at 87, kept clear of
# Q2_BASE's vertical which ends exactly at 87 -- an earlier y=89 put this
# jumper's pad within ~0.36mm of Q2_BASE's own endpoint at (12,87)) --
# crosses SSR_MINUS's vertical at x=9.
_g2p, _g2q = add_jumper("JBg2", (9.0, 91.0), 5.0, "GND", "h")
route("GND", [pad_abs("R2","2"), (14.54, 91.0), _g2q])
route("GND", [_g2p, (5.0, 91.0)])

# J3.pad2: straight across at its own Y (97.54), below where
# SSR_MINUS's own vertical ends (95) -- no crossing needed.
route("GND", [pad_abs("J3","2"), (5.0, 97.54)])

# ---- LED cluster local GND lane (x=47, right of everything in this
# cluster), taps the spine once at the top. ----
route("GND", [(47.0, SPINE_Y), (47.0, 92.0)])

# Q1.pad3(E): down 2mm off the row then across to the local GND lane --
# no crossing (stays clear of Q1_BASE's detour at y=67 and LED_CATHODE's
# own path). Full width now that pads are at 2.54mm pitch.
route("GND", [pad_abs("Q1","3"), (43.08, 74.0), (47.0, 74.0)])

# J4.pad2: straight across at its own Y (88.54), well clear of
# LED_CATHODE's path (ends at 86) -- no crossing needed.
route("GND", [pad_abs("J4","2"), (47.0, 88.54)])

# ---- SSR driver stage internals ----
route("Q2_BASE", [pad_abs("R3","2"), (17.54, 67.0), (12.0, 67.0), pad_abs("Q2","1")])
# R2.pad1 -> Q2.pad1 is a straight vertical at x=12 that crosses
# SSR_MINUS's own horizontal detour (at y=77, x=14.54->9) on the way --
# broken with a vertical-axis jumper right at that crossing.
_g3p, _g3q = add_jumper("JBg3", (12.0, 77.0), 5.0, "Q2_BASE", "v")
route("Q2_BASE", [pad_abs("R2","1"), _g3q])
route("Q2_BASE", [_g3p, pad_abs("Q2","1")])
route("SSR_MINUS", [pad_abs("Q2","2"), (14.54, 77.0), (9.0, 77.0), pad_abs("J3","1")])

# ---- LED driver stage internals. Q1's legs bent to 2.54mm pitch (see
# placement above), so full-width tape trace reaches every pad. ----
route("Q1_BASE", [pad_abs("R4","2"), (43.54, 67.0), (40.54, 67.0), pad_abs("Q1","2")])

route("LED_CATHODE", [pad_abs("Q1","1"), (38.0, 80.0), (41.0, 80.0), pad_abs("J4","1")])

# ============================================================
# 6. Automatic conflict check (track-vs-track AND track-vs-foreign-pad) +
#    jumper patch loop, run to convergence before writing the board file.
# ============================================================
def classify(a, b):
    if abs(a[1] - b[1]) < 1e-6 and abs(a[0] - b[0]) >= 1e-6:
        return ("H", a[1], min(a[0], b[0]), max(a[0], b[0]))
    if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) >= 1e-6:
        return ("V", a[0], min(a[1], b[1]), max(a[1], b[1]))
    raise ValueError(f"non-Manhattan segment {a}-{b}")

PAD_CLEARANCE = 1.0  # pad radius (~0.85 max) + 0.8mm relaxed clearance rule, rounded up

def foreign_pads():
    """(x, y, net) for every pad on the board, used for the track-vs-pad check."""
    out = []
    import math
    for ref, fp in placed.items():
        a = math.radians(fp.position.angle or 0)
        for pad in fp.pads:
            if pad.net is None:
                continue
            lx, ly = pad.position.X, pad.position.Y
            rx = lx * math.cos(a) - ly * math.sin(a)
            ry = lx * math.sin(a) + ly * math.cos(a)
            out.append((fp.position.X + rx, fp.position.Y + ry, pad.net.name))
    return out

ALL_PADS = None  # filled lazily so placement is complete first

def find_conflicts(segs):
    conflicts = []  # (i, j_or_None, point) -- j is None for a track-vs-pad hit
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            s1, s2 = segs[i], segs[j]
            if s1["net"] == s2["net"]:
                continue
            k1 = classify(s1["a"], s1["b"])
            k2 = classify(s2["a"], s2["b"])
            if k1[0] == k2[0]:
                continue  # parallel same-direction: spacing handled by design, not here
            h, v = (k1, k2) if k1[0] == "H" else (k2, k1)
            _, hy, hx0, hx1 = h
            _, vx, vy0, vy1 = v
            if hx0 - 1e-6 <= vx <= hx1 + 1e-6 and vy0 - 1e-6 <= hy <= vy1 + 1e-6:
                pt = (vx, hy)
                if pt in (s1["a"], s1["b"]) and pt in (s2["a"], s2["b"]):
                    continue  # a real shared junction, not a short
                conflicts.append((i, j, pt))
    # NOTE: a track-vs-foreign-pad check was tried here too, but a simple
    # distance threshold produces false positives against a part's OWN
    # nearby-but-different-net pads (e.g. a resistor's two legs, 2.54mm
    # apart, are closer than the safe clearance radius by construction).
    # Track-vs-track crossings (above) are the precise, reliable check;
    # real pad clearance is left to kicad-cli's DRC, which is authoritative.
    return conflicts

def find_parallel_overlaps(segs, min_gap=2.5):
    """Diagnostic only (not auto-fixed): same-axis segments of different nets
    whose perpendicular separation is under the safe pitch. The board is a
    0.5mm-deep/wide groove printed into the part, a full copper tape roll
    glued over it, then cut along the groove edge with a hobby knife --
    clearance is 0.5mm and track width 2.0mm -> 2.5mm minimum pitch. A real
    overlap (gap<=0) is the severe case. (Segments using the thinner THIN
    width near U1 have their own, smaller real requirement -- this
    diagnostic's fixed threshold is deliberately conservative for those,
    so a reported pair involving one of them isn't necessarily a problem;
    check the actual widths before trusting it as an error.)"""
    out = []
    for i in range(len(segs)):
        for j in range(i + 1, len(segs)):
            s1, s2 = segs[i], segs[j]
            if s1["net"] == s2["net"]:
                continue
            k1 = classify(s1["a"], s1["b"])
            k2 = classify(s2["a"], s2["b"])
            if k1[0] != k2[0]:
                continue
            _, c1, lo1, hi1 = k1
            _, c2, lo2, hi2 = k2
            if lo1 - 1e-6 > hi2 or lo2 - 1e-6 > hi1:
                continue  # along-axis ranges don't overlap
            gap = abs(c1 - c2)
            if gap < min_gap:
                out.append((i, j, gap))
    return out

if __name__ == "__main__":
    ALL_PADS = foreign_pads()
    # Every real crossing was bridged by hand above with its own explicit
    # add_jumper() call (an earlier automatic patcher that split segments
    # and inserted jumpers in a loop had edge-case bugs -- co-located
    # jumper pads, tracks left half-connected -- so this is now a pure
    # verification pass: it must report 0 conflicts, not fix them).
    conflicts = find_conflicts(SEGMENTS)
    if conflicts:
        print(len(conflicts), "UNRESOLVED conflicts (every one of these is a bug -- fix by hand above):")
        for (i, j, pt) in conflicts:
            print("   ", SEGMENTS[i]["net"], SEGMENTS[i]["a"], SEGMENTS[i]["b"], "x",
                  SEGMENTS[j]["net"], SEGMENTS[j]["a"], SEGMENTS[j]["b"], "@", pt)
    else:
        print("0 conflicts,", len(SEGMENTS), "segments,", len(board_footprints), "footprints")
    print("total footprints:", len(board_footprints))

    overlaps = find_parallel_overlaps(SEGMENTS)
    severe = [o for o in overlaps if o[2] < 0.5]
    print(f"parallel-proximity check: {len(overlaps)} pairs under 5mm gap, {len(severe)} of those under 0.5mm (near-direct overlap)")
    for i, j, gap in sorted(severe, key=lambda t: t[2])[:15]:
        print(f"   gap={gap:.2f}mm: {SEGMENTS[i]['net']} {SEGMENTS[i]['a']}-{SEGMENTS[i]['b']}  vs  {SEGMENTS[j]['net']} {SEGMENTS[j]['a']}-{SEGMENTS[j]['b']}")

    # ============================================================
    # 7. Write the board file: header/setup (matching KiCad 10's own
    #    format), net table, all footprints (fully embedded, no external
    #    footprint library needed), board outline, and every track segment.
    # ============================================================
    TRACK_WIDTH = 2.0
    MARGIN = 3.0

    header = f'''(kicad_pcb
  (version 20260206)
  (generator "espresso-board-mini-gen")
  (generator_version "10.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (2 "B.Cu" signal)
    (9 "F.Adhes" user "F.Adhesive")
    (11 "B.Adhes" user "B.Adhesive")
    (13 "F.Paste" user)
    (15 "B.Paste" user)
    (5 "F.SilkS" user "F.Silkscreen")
    (7 "B.SilkS" user "B.Silkscreen")
    (1 "F.Mask" user)
    (3 "B.Mask" user)
    (17 "Dwgs.User" user "User.Drawings")
    (19 "Cmts.User" user "User.Comments")
    (21 "Eco1.User" user "User.Eco1")
    (23 "Eco2.User" user "User.Eco2")
    (25 "Edge.Cuts" user)
    (27 "Margin" user)
    (31 "F.CrtYd" user "F.Courtyard")
    (29 "B.CrtYd" user "B.Courtyard")
    (35 "F.Fab" user)
    (33 "B.Fab" user)
    (39 "User.1" user)
    (41 "User.2" user)
    (43 "User.3" user)
    (45 "User.4" user)
  )
  (setup
    (pad_to_mask_clearance 0)
    (allow_soldermask_bridges_in_footprints no)
    (pcbplotparams
      (layerselection 0x00000000_00000000_55555555_5755f5ff)
      (plot_on_all_layers_selection 0x00000000_00000000_00000000_00000000)
      (disableapertmacros no)
      (usegerberextensions no)
      (usegerberattributes yes)
      (usegerberadvancedattributes yes)
      (creategerberjobfile yes)
      (dashed_line_dash_ratio 12)
      (dashed_line_gap_ratio 3)
      (svgprecision 4)
      (plotframeref no)
      (mode 1)
      (useauxorigin no)
      (pdf_front_fp_property_popups yes)
      (pdf_back_fp_property_popups yes)
      (pdf_metadata yes)
      (pdf_single_document no)
      (dxfpolygonmode yes)
      (dxfimperialunits yes)
      (dxfusepcbnewfont yes)
      (psnegative no)
      (psa4output no)
      (plot_black_and_white yes)
      (sketchpadsonfab no)
      (plotpadnumbers no)
      (hidednponfab no)
      (sketchdnponfab yes)
      (crossoutdnponfab yes)
      (subtractmaskfromsilk no)
      (outputformat 1)
      (mirror no)
      (drillshape 1)
      (scaleselection 1)
      (outputdirectory "")
    )
  )
'''

    net_lines = ['  (net 0 "")\n']
    for name, num in NET_NUM.items():
        net_lines.append(f'  (net {num} "{name}")\n')

    body_parts = []
    for fp in board_footprints:
        body_parts.append(fp.to_sexpr(indent=2))

    outline = GrRect(start=Position(0, 0), end=Position(BOARD_W, BOARD_LEN),
                      layer="Edge.Cuts", width=0.15, tstamp=u())
    body_parts.append(outline.to_sexpr(indent=2))

    for seg in SEGMENTS:
        w = seg.get("width") or TRACK_WIDTH
        s = Segment(start=Position(*seg["a"]), end=Position(*seg["b"]),
                    width=w, layer="B.Cu", net=NET_NUM[seg["net"]], tstamp=u())
        body_parts.append(s.to_sexpr(indent=2))

    footer = ")\n"

    OUT_DIR = "/Users/ricardo/projects/hobbie/philco_mod/hardware/espresso-board-mini"
    out_path = f"{OUT_DIR}/espresso-board-mini.kicad_pcb"
    with open(out_path, "w") as f:
        f.write(header)
        f.writelines(net_lines)
        for part in body_parts:
            f.write(part)
        f.write(footer)
    print("wrote", out_path)
    print("board size:", BOARD_W, "x", BOARD_LEN, "mm")
    jumper_count = sum(1 for fp in board_footprints if fp.libId.startswith("Jumper:"))
    print("jumper bridges:", jumper_count)
