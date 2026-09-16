import uuid, copy
from kiutils.schematic import Schematic
from kiutils.items.common import Position, Property, Effects, Font, PageSettings
from kiutils.items.schitems import (SchematicSymbol, Connection, LocalLabel, NoConnect,
                                     SymbolProjectInstance, SymbolProjectPath, Text)
from kiutils.symbol import Symbol, SymbolPin
from kiutils.utils import sexpr

SRC = "/Users/ricardo/projects/hobbie/philco_mod/hardware/espresso-board/espresso-board.kicad_sch"
old = Schematic().from_file(SRC)

def u():
    return str(uuid.uuid4())

PROJECT_NAME = "espresso-board-mini"
ROOT_UUID = u()

# ---- reuse library symbols from old schematic ----
wanted = ["Device:R", "Switch:SW_Push", "Transistor_BJT:BC547", "Transistor_BJT:TIP120",
          "power:+3.3V", "power:GND", "Connector:Conn_01x03_Pin",
          "Connector:Conn_01x04_Pin", "Connector:Conn_01x05_Pin"]
lib_symbols = []
for sym in old.libSymbols:
    if sym.libId in wanted:
        lib_symbols.append(copy.deepcopy(sym))

# ---- add Conn_01x02_Pin (parsed from KiCad's own Connector.kicad_sym) ----
from kiutils.symbol import SymbolLib
conn_lib = SymbolLib().from_file("/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols/Connector.kicad_sym")
for sym in conn_lib.symbols:
    if sym.entryName == "Conn_01x02_Pin":
        s = copy.deepcopy(sym)
        s.libraryNickname = "Connector"
        lib_symbols.append(s)

power_lib = SymbolLib().from_file("/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols/power.kicad_sym")
for sym in power_lib.symbols:
    if sym.entryName == "PWR_FLAG":
        s = copy.deepcopy(sym)
        s.libraryNickname = "power"
        lib_symbols.append(s)

print("Loaded", len(lib_symbols), "reused lib symbols:", [s.libId for s in lib_symbols])

# ---- custom ESP32-C3 Super Mini symbol ----
from kiutils.items.syitems import SyRect
from kiutils.items.common import Stroke, Fill

LEFT_PINS = ["5V", "GND", "3V3", "GPIO4", "GPIO3", "GPIO2", "GPIO1", "GPIO0"]
RIGHT_PINS = ["GPIO5", "GPIO6", "GPIO7", "GPIO8", "GPIO9", "GPIO10", "GPIO20", "GPIO21"]
POWER_NAMES = {"5V", "GND", "3V3"}

def make_effects(size=1.27):
    return Effects(font=Font(width=size, height=size))

esp = Symbol()
esp.libId = "ESP32C3_SuperMini"
esp.inBom = True
esp.onBoard = True
esp.pinNames = True
esp.pinNamesOffset = 1.016
esp.properties = [
    Property(key="Reference", value="U", id=0, position=Position(0, 13.97, 0), effects=make_effects()),
    Property(key="Value", value="ESP32C3_SuperMini", id=1, position=Position(0, 11.43, 0), effects=make_effects()),
    Property(key="Footprint", value="ESP32C3_SuperMini:ESP32C3_SuperMini_2x8_P2.54mm", id=2,
             position=Position(0, 0, 0), effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    Property(key="Datasheet", value="", id=3, position=Position(0, 0, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
]

unit = Symbol()
unit.libId = "ESP32C3_SuperMini_0_1"
unit.graphicItems = [
    SyRect(start=Position(-7.62, 8.89), end=Position(7.62, -8.89),
           stroke=Stroke(width=0.254), fill=Fill(type="background"))
]

y0 = 8.89
for i, name in enumerate(LEFT_PINS):
    y = y0 - i * 2.54
    etype = "power_in" if name in POWER_NAMES else "bidirectional"
    unit.pins.append(SymbolPin(
        electricalType=etype, graphicalStyle="line",
        position=Position(-12.7, y, 0), length=5.08,
        name=name, number=str(i + 1),
    ))
for i, name in enumerate(RIGHT_PINS):
    y = y0 - i * 2.54
    unit.pins.append(SymbolPin(
        electricalType="bidirectional", graphicalStyle="line",
        position=Position(12.7, y, 180), length=5.08,
        name=name, number=str(i + 9),
    ))

esp.units = [unit]
lib_symbols.append(esp)
print("ESP32 symbol pins:", [(p.number, p.name, p.position.X, p.position.Y) for p in unit.pins])

# ---- pin lookup table: lib_id -> {pin_number_or_name: (x,y)} (angle=0 / no mirror placement only) ----
PIN_XY = {}
for sym in lib_symbols:
    table = {}
    for un in sym.units:
        for p in un.pins:
            table[p.number] = (p.position.X, p.position.Y)
            if p.name and p.name != "~":
                table[p.name] = (p.position.X, p.position.Y)
    PIN_XY[sym.libId] = table

new = Schematic()
new.version = old.version
new.generator = old.generator
new.uuid = ROOT_UUID
new.paper = copy.deepcopy(old.paper)
new.libSymbols = lib_symbols

FOOTPRINTS = {
    "Device:R": "Resistor_THT:R_Axial_DIN0204_L3.6mm_D1.6mm_P2.54mm_Vertical",
    "Switch:SW_Push": "Button_Switch_THT:SW_PUSH_6mm",
    "Transistor_BJT:BC547": "Package_TO_SOT_THT:TO-92_Inline",
    "Transistor_BJT:TIP120": "Package_TO_SOT_THT:TO-220-3_Vertical",
    "Connector:Conn_01x02_Pin": "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
    "Connector:Conn_01x04_Pin": "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
    "Connector:Conn_01x05_Pin": "Connector_PinHeader_2.54mm:PinHeader_1x05_P2.54mm_Vertical",
    "ESP32C3_SuperMini": "ESP32C3_SuperMini:ESP32C3_SuperMini_2x8_P2.54mm",
}

ref_counters = {}
def next_ref(prefix):
    ref_counters[prefix] = ref_counters.get(prefix, 0) + 1
    return f"{prefix}{ref_counters[prefix]}"

def R(v):
    return round(v, 2)

instances_by_ref = {}

def add_symbol(lib_id, ref, value, pos, angle=0):
    fp = FOOTPRINTS[lib_id]
    inst = SchematicSymbol()
    inst.libId = lib_id
    inst.position = Position(R(pos[0]), R(pos[1]), angle)
    inst.unit = 1
    inst.inBom = True
    inst.onBoard = True
    inst.dnp = False
    inst.fieldsAutoplaced = True
    inst.uuid = u()
    inst.properties = [
        Property(key="Reference", value=ref, id=0, position=Position(pos[0]+2, pos[1]-2, 0), effects=make_effects()),
        Property(key="Value", value=value, id=1, position=Position(pos[0]+2, pos[1]+2, 0), effects=make_effects()),
        Property(key="Footprint", value=fp, id=2, position=Position(pos[0], pos[1], 0),
                 effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
        Property(key="Datasheet", value="", id=3, position=Position(pos[0], pos[1], 0),
                 effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    ]
    inst.instances = [SymbolProjectInstance(
        name=PROJECT_NAME,
        paths=[SymbolProjectPath(sheetInstancePath=f"/{ROOT_UUID}", reference=ref, unit=1)]
    )]
    new.schematicSymbols.append(inst)
    instances_by_ref[ref] = inst
    return inst

def pin_abs(ref, number):
    # Symbol library frame is Y-up; schematic frame is Y-down. For instances placed at
    # angle=0 with no mirror, absolute = (instance.x + local_x, instance.y - local_y).
    inst = instances_by_ref[ref]
    key = number if isinstance(number, str) else str(number)
    lx, ly = PIN_XY[inst.libId][key]
    return (R(inst.position.X + lx), R(inst.position.Y - ly))

def wire(p1, p2):
    new.graphicalItems.append(Connection(type="wire", points=[Position(*p1), Position(*p2)], uuid=u()))

def label(pos, name):
    new.labels.append(LocalLabel(text=name, position=Position(pos[0], pos[1], 0), effects=make_effects(), uuid=u()))

def stub_label(ref, number, dx, dy, name):
    p1 = pin_abs(ref, number)
    p2 = (R(p1[0] + dx), R(p1[1] + dy))
    wire(p1, p2)
    label(p2, name)
    return p2

def no_connect(ref, number):
    p = pin_abs(ref, number)
    new.noConnects.append(NoConnect(position=Position(*p), uuid=u()))

def power_symbol(ref_prefix, lib_id, value, pos):
    ref = f"#PWR{ref_counters.get('#PWR',0)+1:03d}"
    ref_counters['#PWR'] = ref_counters.get('#PWR', 0) + 1
    inst = SchematicSymbol()
    inst.libId = lib_id
    inst.position = Position(R(pos[0]), R(pos[1]), 0)
    inst.unit = 1
    inst.inBom = False
    inst.onBoard = False
    inst.dnp = False
    inst.fieldsAutoplaced = True
    inst.uuid = u()
    inst.properties = [
        Property(key="Reference", value=ref, id=0, position=Position(pos[0], pos[1]-2.5, 0),
                  effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
        Property(key="Value", value=value, id=1, position=Position(pos[0], pos[1]+2.5, 0), effects=make_effects()),
        Property(key="Footprint", value="", id=2, position=Position(pos[0], pos[1], 0),
                 effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
        Property(key="Datasheet", value="", id=3, position=Position(pos[0], pos[1], 0),
                 effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    ]
    inst.instances = [SymbolProjectInstance(
        name=PROJECT_NAME,
        paths=[SymbolProjectPath(sheetInstancePath=f"/{ROOT_UUID}", reference=ref, unit=1)]
    )]
    new.schematicSymbols.append(inst)
    return inst

def stub_power(ref, number, dx, dy, lib_id, value):
    p1 = pin_abs(ref, number)
    p2 = (R(p1[0] + dx), R(p1[1] + dy))
    wire(p1, p2)
    power_symbol(lib_id, lib_id, value, p2)

def text_note(pos, msg):
    new.texts.append(Text(text=msg, position=Position(pos[0], pos[1], 0), effects=make_effects(1.0)))

# ================= placement =================
# all coordinates are multiples of 1.27mm (the schematic connection grid) so every
# pin (already at n*1.27 in the library frame) and every stub wire lands on-grid.
G = 1.27

def snap(v):
    return round(v / G) * G

def P(x, y):
    return (snap(x), snap(y))

# U1 - ESP32-C3 Super Mini
add_symbol("ESP32C3_SuperMini", "U1", "ESP32C3_SuperMini", P(120.65, 78.74))

# left column (pins 1-8)
no_connect("U1", 1)                                        # 5V - not used (module powered via its own USB-C)
stub_power("U1", 2, -7.62, 0, "power:GND", "GND")           # GND
stub_power("U1", 3, -7.62, 0, "power:+3.3V", "+3.3V")       # 3V3
no_connect("U1", 4)                                         # GPIO4 spare
stub_label("U1", 5, -7.62, 0, "BTN_GPIO3")                  # GPIO3 -> button
no_connect("U1", 6)                                         # GPIO2 spare
stub_label("U1", 7, -7.62, 0, "READY_GPIO1")                # GPIO1 -> ready relay
stub_label("U1", 8, -7.62, 0, "PUMP_GPIO0")                 # GPIO0 -> pump relay

# right column (pins 9-16)
stub_label("U1", 9, 7.62, 0, "THERMO_SCK")                  # GPIO5
stub_label("U1", 10, 7.62, 0, "THERMO_SO")                  # GPIO6
stub_label("U1", 11, 7.62, 0, "THERMO_CS")                  # GPIO7
stub_label("U1", 12, 7.62, 0, "OLED_SDA")                   # GPIO8
stub_label("U1", 13, 7.62, 0, "OLED_SCL")                   # GPIO9
stub_label("U1", 14, 7.62, 0, "SSR_ACT_GPIO10")             # GPIO10
stub_label("U1", 15, 7.62, 0, "LED_ACT_GPIO20")             # GPIO20
no_connect("U1", 16)                                        # GPIO21 spare

# SW1 - button (GPIO3 to GND)
add_symbol("Switch:SW_Push", "SW1", "SW_Push", P(99.06, 104.14))
stub_label("SW1", 1, -5.08, 0, "BTN_GPIO3")
stub_power("SW1", 2, 5.08, 0, "power:GND", "GND")

# ---- LED driver stage: GPIO20 -> R4(1k) -> Q1(BC547) base; collector -> J_LED; emitter -> GND
# vertical resistor: pin1 is the TOP pin (moves away from body upward -> smaller Y),
# pin2 is the BOTTOM pin (moves away from body downward -> larger Y).
add_symbol("Device:R", "R4", "1k", P(99.06, 118.11))
stub_label("R4", 1, 0, -3.81, "LED_ACT_GPIO20")
stub_label("R4", 2, 0, 3.81, "Q1_BASE")

add_symbol("Transistor_BJT:BC547", "Q1", "BC547", P(114.3, 113.03))
stub_label("Q1", "B", -5.08, 0, "Q1_BASE")
stub_label("Q1", "C", 0, -6.35, "LED_CATHODE")
stub_power("Q1", "E", 0, 6.35, "power:GND", "GND")

add_symbol("Connector:Conn_01x02_Pin", "J4", "J_LED", P(140.97, 113.03))
stub_label("J4", 1, -6.35, 0, "LED_CATHODE")
stub_power("J4", 2, -6.35, 0, "power:GND", "GND")

# ---- SSR driver stage: GPIO10 -> R3(1k) -> Q2(TIP120) base; R2(10k) base pulldown; collector -> J_SSR; emitter -> GND
add_symbol("Device:R", "R3", "1k", P(102.87, 133.35))
stub_label("R3", 1, 0, -3.81, "SSR_ACT_GPIO10")
stub_label("R3", 2, 0, 3.81, "Q2_BASE")

add_symbol("Device:R", "R2", "10k", P(111.76, 129.54))
stub_label("R2", 1, 0, -3.81, "Q2_BASE")
stub_power("R2", 2, 0, 3.81, "power:GND", "GND")

add_symbol("Transistor_BJT:TIP120", "Q2", "TIP120", P(127.0, 133.35))
stub_label("Q2", "B", -5.08, 0, "Q2_BASE")
stub_label("Q2", "C", 0, -6.35, "SSR_MINUS")
stub_power("Q2", "E", 0, 6.35, "power:GND", "GND")

add_symbol("Connector:Conn_01x02_Pin", "J3", "J_SSR", P(149.86, 133.35))
stub_label("J3", 1, -6.35, 0, "SSR_MINUS")
stub_power("J3", 2, -6.35, 0, "power:GND", "GND")

# ---- relay connectors ----
add_symbol("Connector:Conn_01x02_Pin", "J1", "J_PUMP_RELE", P(99.06, 149.86))
stub_label("J1", 1, -6.35, 0, "PUMP_GPIO0")
stub_power("J1", 2, -6.35, 0, "power:GND", "GND")

add_symbol("Connector:Conn_01x02_Pin", "J2", "J_READY_RELE", P(99.06, 160.02))
stub_label("J2", 1, -6.35, 0, "READY_GPIO1")
stub_power("J2", 2, -6.35, 0, "power:GND", "GND")

# ---- thermocouple MAX6675 connector (5p: GND, +3V3, SCK, CS, SO) ----
add_symbol("Connector:Conn_01x05_Pin", "J5", "J_THERMO_MAX6675", P(99.06, 175.26))
stub_power("J5", 1, -6.35, 0, "power:GND", "GND")
stub_power("J5", 2, -6.35, 0, "power:+3.3V", "+3.3V")
stub_label("J5", 3, -6.35, 0, "THERMO_SCK")
stub_label("J5", 4, -6.35, 0, "THERMO_CS")
stub_label("J5", 5, -6.35, 0, "THERMO_SO")
text_note((91.44, 168.91), "J5: 1=GND 2=3V3 3=SCK 4=CS 5=SO (MAX6675)")

# ---- OLED I2C connector (4p: GND, +3V3, SDA, SCL) ----
add_symbol("Connector:Conn_01x04_Pin", "J6", "J_OLED_I2C", P(129.54, 175.26))
stub_power("J6", 1, 6.35, 0, "power:GND", "GND")
stub_power("J6", 2, 6.35, 0, "power:+3.3V", "+3.3V")
stub_label("J6", 3, 6.35, 0, "OLED_SDA")
stub_label("J6", 4, 6.35, 0, "OLED_SCL")
text_note((132.08, 168.91), "J6: 1=GND 2=3V3 3=SDA(GPIO8) 4=SCL(GPIO9)")

# ---- PWR_FLAG markers so ERC knows GND/+3V3 nets have a source (module's own supply/USB) ----
add_symbol_raw = None  # placeholder not used
gnd_flag_gnd = power_symbol("power:GND", "power:GND", "GND", (168.91, 60.96))
gnd_flag = SchematicSymbol()
gnd_flag.libId = "power:PWR_FLAG"
gnd_flag.position = Position(168.91, 55.88, 0)
gnd_flag.unit = 1
gnd_flag.inBom = True
gnd_flag.onBoard = True
gnd_flag.dnp = False
gnd_flag.fieldsAutoplaced = True
gnd_flag.uuid = u()
gnd_flag.properties = [
    Property(key="Reference", value="#FLG1", id=0, position=Position(168.91, 53.34, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    Property(key="Value", value="PWR_FLAG", id=1, position=Position(168.91, 50.8, 0), effects=make_effects()),
    Property(key="Footprint", value="", id=2, position=Position(168.91, 55.88, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    Property(key="Datasheet", value="", id=3, position=Position(168.91, 55.88, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
]
gnd_flag.instances = [SymbolProjectInstance(
    name=PROJECT_NAME, paths=[SymbolProjectPath(sheetInstancePath=f"/{ROOT_UUID}", reference="#FLG1", unit=1)]
)]
new.schematicSymbols.append(gnd_flag)
wire((168.91, 60.96), (168.91, 55.88))

v3_flag_src = power_symbol("power:+3.3V", "power:+3.3V", "+3.3V", (184.15, 60.96))
v3_flag = SchematicSymbol()
v3_flag.libId = "power:PWR_FLAG"
v3_flag.position = Position(184.15, 55.88, 0)
v3_flag.unit = 1
v3_flag.inBom = True
v3_flag.onBoard = True
v3_flag.dnp = False
v3_flag.fieldsAutoplaced = True
v3_flag.uuid = u()
v3_flag.properties = [
    Property(key="Reference", value="#FLG2", id=0, position=Position(184.15, 53.34, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    Property(key="Value", value="PWR_FLAG", id=1, position=Position(184.15, 50.8, 0), effects=make_effects()),
    Property(key="Footprint", value="", id=2, position=Position(184.15, 55.88, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
    Property(key="Datasheet", value="", id=3, position=Position(184.15, 55.88, 0),
             effects=Effects(font=Font(width=1.27, height=1.27), hide=True)),
]
v3_flag.instances = [SymbolProjectInstance(
    name=PROJECT_NAME, paths=[SymbolProjectPath(sheetInstancePath=f"/{ROOT_UUID}", reference="#FLG2", unit=1)]
)]
new.schematicSymbols.append(v3_flag)
wire((184.15, 60.96), (184.15, 55.88))

text_note((80, 60), "espresso-board-mini -- ESP32-C3 Super Mini")
text_note((80, 63), "GPIO8/9 usados p/ I2C OLED -- status LED onboard nao usado no firmware")

# ---- sheet instances (required top-level section) ----
from kiutils.items.schitems import HierarchicalSheetInstance
new.sheetInstances = [HierarchicalSheetInstance(instancePath="/", page="1")]

OUT = "/private/tmp/claude-501/-Users-ricardo-projects-hobbie-philco-mod-hardware/98c21e1d-9bcf-4435-b7b8-b85d17ee611d/scratchpad/espresso-board-mini.kicad_sch"
new.to_file(OUT)
print("wrote", OUT)

