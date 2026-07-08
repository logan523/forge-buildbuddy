# Engineering Methodology Research for BuildBuddy AI Platform

## The Meta-Question

**"How can we approach any project in the simplest way to get built?"**

This document synthesizes research across six pillars of hardware build methodology, with specific recommendations for encoding each into an AI system's behavior, UX design, and pipeline architecture.

---

## 1. Lean Hardware Development

### Core Principles

**1. "Start Ugly, Learn Fast"**

The dominant 2025 philosophy: the cost of building the wrong thing perfectly now exceeds the cost of building the right thing scrappily. With AI accelerating software expectations, hardware teams can no longer afford 6-week PCB turns and 3-month tooling cycles before learning whether something works.

Real-world example: an early Golioth customer taped a Nordic Thingy91 to an electric motorcycle and had GNSS + accelerometer data flowing to a dashboard in under 12 hours. Twelve hours. Not twelve months.

**2. Three Stages Never to Skip**

| Stage | Goal | What It Looks Like |
|-------|------|--------------------|
| Proof of Concept | "Can this technically work?" | Breadboards, hot glue, throwaway code, dev boards |
| MVP | "Will people use this?" | Off-the-shelf modules + 3D-printed enclosures |
| Functional Prototype | System integration | Custom PCB, real enclosure, production-like |

**3. Separation of Learning from Showing**

The ugly prototype on your bench tells you the truth. The sleek one in the case tells a story. Never use the second to make engineering decisions. Build two things: one to learn from, one to show.

**4. Avoid Premature Convergence**

When faced with uncertainty (which antenna, which power strategy), try two approaches in parallel. It is faster to explore two paths than commit to the wrong one. This is counterintuitive but mathematically true for hardware, where rework costs dominate.

**5. COTS Over Custom, Always at First**

Nordic dev kits have more compute than the Apollo guidance computer. ESP32 boards cost $5. Particle.io gives you cellular + cloud in one module. There is almost no project that cannot be proven with off-the-shelf modules first.

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must ALWAYS suggest a PoC approach before any custom PCB recommendation
- AI must classify every project into the three-stage framework and only advance stages when risk is retired
- When the user says "I want to build X," the AI's first response should ask: "What is the ONE thing you need to prove first?"

**Architecture decision:**
- A "Stage Classifier" module in the pipeline that maps user intent to PoC/MVP/Functional-Prototype stage
- For PoC-stage outputs: constrain the BOM to dev boards + modules ONLY
- For MVP-stage outputs: allow limited custom parts (3D prints, simple PCBs) but flag any part with >1 week lead time

**UI manifestation:**
- Three distinct "build modes" the user can select, each with different depth, BOM constraints, and expected time-to-build

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| "Tape a sensor dev kit to your bike, ride around the block, look at the data" | "Design a custom PCB with an IMU, GPS, BLE, and battery charger, order from JLCPCB" |
| "Prove the motor can lift the weight using a bench supply and an Arduino" | "Build the full robot chassis, wire everything, then test" |
| "Use a Raspberry Pi to prototype the camera pipeline, swap to a custom carrier board later" | "Spec the Jetson Orin on day one and design the entire thermal solution upfront" |

---

## 2. Minimal Viable Builds

### Core Principles

**1. Identify the Riskiest Assumption First (RAF)**

Instead of building a full product, identify the SINGLE riskiest assumption and design the smallest possible experiment to test it. If it holds, proceed. If it fails, pivot immediately. In hardware:

- "Will this sensor work in the target environment?" -- test just the sensor on a dev board
- "Can this motor lift the payload?" -- test just the motor with a bench supply
- "Will the battery last long enough?" -- measure actual consumption of just the core loop

**2. Test Subsystems Independently Before Integration**

The "assemble everything then pray" approach is the #1 cause of multi-day debug sessions. Instead: power supply first (verify voltages), then microcontroller (blink LED), then each sensor one at a time, then communication, then the full system. Each step is a known-good foundation.

**3. Define What You Are NOT Building**

Every project brief should include an explicit "out of scope" section. Without this, scope creeps every time. Example: "This build does NOT include: weatherproofing, battery optimization, OTA updates, or a mobile app."

**4. Cut Corners Strategically**

| Safe to Cut | Never Cut |
|-------------|-----------|
| Enclosure aesthetics (cardboard is fine) | Power regulation (brownouts cause impossible-to-debug glitches) |
| Code elegance (global variables, blocking loops) | Electrical isolation (mains voltage = no shortcuts) |
| Mechanical precision (hot glue > custom brackets) | Fusing/overcurrent protection |
| Wireless range optimization | Battery protection (overcharge/overdischarge) |
| UI polish (serial monitor > touchscreen) | Grounding and shielding for safety-critical systems |

**5. The One-Day Build Philosophy**

Realistic timeline for a working proof-of-concept:
- 30 min: Sketch, gather modules, set up breadboard power
- 1-2 hours: Assemble core circuit in stages, testing each section
- 1 hour: Write/modify code (ALWAYS start from example sketches)
- 30 min: Debug with multimeter, tweak, iterate
- 30 min: Document what worked and what failed

Total: ~4 hours for a working PoC, with room for 2-3 iterations in a day.

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must output an explicit "Riskiest Assumption" section for every build plan
- AI must propose subsystem test order: "Test 1: power rails, Test 2: MCU blink, Test 3: sensor reads..."
- AI must include an "Out of Scope" section in every build plan
- AI must flag any suggested part/step that has >1 day of lead time as "SLOW PATH" with an alternative

**Architecture decision:**
- A "Risk Analyzer" module that scans the BOM and build steps for common failure modes (mains voltage, lithium batteries, high current, high speed signals) and auto-adds safety warnings
- A "Dependency Graph" generator that outputs the correct subsystem test order

**UI manifestation:**
- Every build plan has a "Quick Test" mode: the absolute minimum to prove the concept, clearly separated from the "Full Build" mode
- "What can go wrong" section auto-populated for each subsystem

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| "Let's test if the PIR sensor can detect motion through the enclosure material before designing the full housing" | "Let's 3D print the enclosure, mount everything, and see if the sensor works" |
| "Breadboard the motor driver, run it for 10 seconds, check temperature with your finger" | "Design the PCB, order it, assemble, and hope the MOSFET doesn't overheat" |
| "Subsystem test: power board + multimeter. Subsystem test: MCU + blink sketch. Subsystem test: add one sensor." | "Connect everything, power on, nothing works, where do I even start?" |

---

## 3. The "One Trip to the Hardware Store" Principle

### Core Principles

**1. Jellybean Parts First**

"Jellybean" components are low-cost, readily available, multi-source parts that have been in continuous production for decades. Designed by many manufacturers, immune to single-supplier disruption.

| Category | Classic Jellybean Parts |
|----------|------------------------|
| Transistors | 2N3904, 2N2222, BC547/BC557 |
| Diodes | 1N4148 (signal), 1N4001-1N4007 (rectifier) |
| MOSFETs | 2N7002, IRF510, BSS138 |
| Op-Amps | LM358, LM324, TL072 |
| Voltage Regulators | 7805 (5V), LM317 (adjustable) |
| Timers | 555 timer IC |
| Passives | Resistors, capacitors (the true workhorses) |

The rule: start every design by asking "can I build the critical path using ONLY jellybean parts?" If yes, the build is instantly more accessible. If no, justify each specialized part explicitly.

**2. Design Around Standard Voltages and Sizes**

- Power: 5V USB (most accessible), 3.3V (modern MCUs), 12V (common for motors/LEDs). Avoid 7.4V, 9V, or other odd voltages unless absolutely necessary.
- Mounting: M3 screws, 2.54mm pin headers, standard breadboard spacing
- Enclosures: common project box sizes, standard PCB form factors (Arduino shield layout, Raspberry Pi HAT layout)
- Connectors: JST-XH (common in battery packs), Dupont (breadboard), barrel jack 5.5x2.1mm, USB-C

**3. Prefer Modules Over Discrete Components**

A $2 PIR sensor module saves 30+ minutes of wiring a bare sensor with supporting resistors and capacitors. A $3 buck converter module saves designing, sourcing, and debugging a power supply. The module is always the right choice for a PoC, and often right for an MVP too.

**4. Use Parametric Search to Find Alternatives**

When a specific part is out of stock, the AI should be able to parametrically find alternatives: same package, same voltage range, similar specs. This means the BOM should store requirements (not just part numbers) so substitutions can be automated.

**5. When a Specialized Part IS Worth It**

| Worth the Wait | Not Worth It |
|----------------|--------------|
| A sensor that is the only one that works for your application (e.g., specific gas sensor) | An expensive MCU when an ESP32 would work |
| A power IC that prevents battery fires | A fancy enclosure material |
| A connector that makes the build dramatically simpler (STEMMA QT / Qwiic) | "Mil-spec" anything for a hobby project |
| The exact motor that fits your mechanical constraints | Brand-name passives |

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must maintain a "Jellybean Parts Catalog" -- a curated database of common, multi-source components mapped to use cases
- AI must prefer modules over discretes in BOM generation, with a flag when a discrete build is actually better
- AI must store component REQUIREMENTS (voltage range, package, key specs) alongside part NUMBERS so alternatives can be auto-suggested
- AI must flag any BOM item that is single-source or has lead time >3 days

**Architecture decision:**
- A "Sourcing Engine" module that interfaces with DigiKey/Mouser/LCSC APIs for real-time stock checking
- A "Jellybean Mapper" that substitutes specialized parts for common equivalents when possible
- A "BOM Optimizer" that reduces part count variety (e.g., "you have three different 10K resistors -- use the same one everywhere")

**UI manifestation:**
- BOM categorized by "buy anywhere" (jellybean), "electronics store" (common modules), "special order" (single-source), "fabricate" (3D print/laser cut)
- One-click "buy all" list that sources everything from the fewest number of vendors
- "Parts you might already have" section: common resistors, jumper wires, USB cables

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| BOM: 1x Arduino Nano ($5), 1x L298N motor driver module ($3), 2x DC motors ($4), 1x 9V battery clip ($1). Everything available at Micro Center or Amazon. | BOM: STM32F407VGT6, IRLZ44N (TO-220), 0.1uF 0805 ceramic (qty 6), custom PCB from JLCPCB, 24V 2A Mean Well supply (DigiKey, 2 week lead time) |
| "If you don't have a 10K resistor, 4.7K or 22K will probably work for this pull-up" | "Use EXACTLY the specified resistor or the circuit will not function" |
| "Any 5V USB charger works. Your phone charger. Your laptop's USB port. A power bank." | "You will need a 5.00V +/- 0.05V bench supply with <50mV ripple" |

---

## 4. Design for Debugability

### Core Principles

**1. "Build a Little, Test a Little"**

The cardinal rule of hardware prototyping. Power up and verify each subsection before adding the next. Fixing one broken section beats debugging an entire rat's nest. This is the hardware equivalent of running your code after every function.

**Tobias Kästner's Law:** "I've never seen any board working the first time. I've never seen any prototype without thin wires patching things out." Plan for failure -- it will happen.

**2. Visual Indicators Are Non-Negotiable**

At minimum, every prototype must have:
- Power LED on every voltage rail (you should know at a glance if power is present)
- Status/debug LED on the MCU (blink patterns convey state without a serial monitor)
- If using wireless: a "connected" indicator

These cost pennies and save hours.

**3. Serial/Debug Output Always Accessible**

Every prototype should include a UART/serial interface accessible without disassembly. USB-to-serial on the board, or at minimum, labeled TX/RX/GND test points. If the device has a display, use it for debug output. If it has an LED, create blink codes. The worst debug experience is a sealed black box.

**4. Modular Construction Enables Swap-Debugging**

When something fails, the fastest debug technique is substitution: swap the suspect module for a known-good one. This requires:
- Modular connections (headers, not soldered wires)
- The ability to isolate subsystems (jumpers, removable power)
- Spare modules (build two of critical subsystems if possible)

**5. Test Points and Accessibility**

| Must Have | Nice to Have |
|-----------|--------------|
| Exposed pads for every power rail and ground | Test points on every signal line |
| Pin headers for key signals | JTAG/SWD debug connector |
| Serial output connector (even just 3 pins) | Current measurement jumpers |
| Reset button accessible without disassembly | Logic analyzer header |

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must include visual indicators (LEDs) in every build plan's "minimum requirements"
- AI must generate a "Debug Checklist" section: what to check first, second, third when something goes wrong
- AI must flag any build that lacks accessible serial output as "HIGH DEBUG RISK"
- AI must suggest modular construction patterns: "build this as two separable modules: the sensor board and the main controller"

**Architecture decision:**
- A "Debug Audit" module that scans build plans for: missing power LEDs, inaccessible test points, monolithic construction, no serial output
- A "Test Sequence Generator" that outputs the correct bring-up order from the dependency graph
- Integration with firmware generation: auto-include debug serial output, status LED patterns, and self-test routines

**UI manifestation:**
- "Test Mode" toggle: shows/hides test points, debug LEDs, and serial connections as a separate visual layer on wiring diagrams
- "Bring-up Sequence" displayed as numbered steps, with pass/fail checkboxes
- "What if it doesn't work?" expandable section for each major subsystem

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| "Before adding the sensor, upload the blink sketch to confirm your Arduino is working. Then upload the I2C scanner sketch to confirm the sensor is wired correctly. THEN upload the actual project code." | "Upload the code. If it doesn't work, good luck." |
| Wiring diagram shows: power LED (with resistor), status LED on GPIO 13, and 3-pin header labeled "TX/RX/GND for debug" | Wiring diagram shows: MCU connected to sensor. No LEDs. No test points. No debug connector. |
| Enclosure has a small window or opening that exposes the USB port and status LEDs | Enclosure is a sealed box that requires removing 8 screws to access anything |

---

## 5. Documentation Quality

### Core Principles

**1. The Adafruit Standard: A Consistent Template Always**

Adafruit Learn System is consistently cited as the gold standard for hardware documentation. Their formula:

1. **Overview** -- What you will build, a compelling photo of the finished project, and estimated time
2. **Parts List** -- Exact product IDs, voltage specs, connector types, links to purchase
3. **Prerequisites** -- Linked guides for assumed knowledge, linked tools/libraries
4. **Wiring** -- Pin connection table + Fritzing/real diagram + breadboard photo + connector notes
5. **Code** -- Complete, tested, linked to GitHub, with library dependencies explicitly listed
6. **Assembly** -- Physical construction with photos at each step
7. **Testing** -- What to expect when you power on, common issues, troubleshooting
8. **Going Further** -- Extensions, modifications, related projects

This template is so effective because it never skips steps, never assumes knowledge, and always provides multiple representations (text + diagram + photo).

**2. Photos at Every Step Are Not Optional**

Every physical change should be photographed. A wiring change, a component placement, an enclosure step -- photograph it. The photo provides ground truth when the text description is ambiguous. The #1 complaint about poor build documentation: "the text said one thing but the photo showed something different" or worse, "there were no photos."

**3. The "IKEA Effect": Pictographic Instructions Without Words**

IKEA's instructions work because they are:
- Language-independent
- Impossible to misinterpret (arrows, proportions, orientation are explicit)
- Sequential with clear state changes between steps

The hardware build equivalent: a wiring diagram that uses color coding, clear pin labels, and arrows showing directionality. A mechanical assembly diagram that shows exploded views with fastener callouts.

**4. Common Failure Modes in Build Docs (and How to Avoid Them)**

| Failure Mode | Fix |
|--------------|-----|
| **Missing prerequisites** (user gets stuck at step 3 because they needed a soldering iron) | Explicit "Prerequisites" section with tools, skills, and linked guides |
| **Outdated links** (product pages move, libraries update) | Store part SPECS, not just links. Use stable GitHub links when possible. Auto-check links. |
| **Assumed knowledge** ("wire the I2C bus" -- what pins? what voltage?) | Explicit pin tables, voltage specs, connector types. Never use jargon without definition. |
| **Untested code** (copy-paste doesn't compile) | Generated code must be compile-tested against real libraries. Link to exact library versions. |
| **Missing "what success looks like"** (user built it but doesn't know if it works right) | Include expected output: "The serial monitor should show: `Temperature: 23.4 C`" |
| **Skipping the enclosure** (user has a working breadboard but no idea how to package it) | Include enclosure options: 3D print files, project box recommendations, mounting templates |

**5. When Video Beats Text, and Vice Versa**

| Video Is Better For | Text/Images Are Better For |
|---------------------|---------------------------|
| Demonstrating physical techniques (soldering, crimping) | Reference material (pinouts, BOMs, schematics) |
| Showing "what it should look like" at each stage | Precise specifications ("connect pin 7 to pin 3") |
| Building confidence ("I can do this!") | Searchability ("what resistor value for this LED?") |
| Overview and context | Detailed step-by-step instructions |
| Complex spatial assembly | Code listings and configuration |

The ideal documentation combines both: a video overview with timestamps, AND a detailed text guide with photos and reference material.

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must generate documentation following the Adafruit 8-section template as its default structure
- AI must include an explicit "Prerequisites" section with tools, skills, and linked guides
- AI must auto-flag any term/technique that requires prerequisite knowledge and link to a definition or guide
- AI must include "Expected Output" for each test step (what the user should see on serial monitor, what the LED should do)

**Architecture decision:**
- A "Documentation Generator" pipeline that takes the build plan and produces multiple outputs:
  - Markdown tutorial (for the web)
  - PDF booklet (for printing/offline)
  - JSON build steps (for an interactive UI with checkboxes)
- A "Link Validator" that periodically checks BOM links and flags dead ones
- A "Prerequisite Analyzer" that scans the build plan and identifies every tool, skill, and knowledge assumption

**UI manifestation:**
- Every build plan rendered in a clean, scrollable format with progress tracking
- Toggle between "overview" (TLDR + photo + BOM) and "step-by-step" (every detail)
- "I'm stuck" button on each step that reveals detailed troubleshooting for that specific step
- "Mark as built" checkboxes with photo upload: user documents their actual build for community validation

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| "Connect the red wire from the PIR sensor to the 5V pin on the Arduino (photo shows exactly which pin). Connect the black wire to GND (photo). Connect the yellow wire to digital pin 2 (photo)." | "Wire the PIR sensor to the Arduino." |
| "You should see the onboard LED blink 3 times when power is applied. If you don't, check: (1) USB cable is a data cable not charge-only, (2) board is selected in Arduino IDE under Tools > Board" | "Upload the code and it should work." |
| Prerequisites section: "You need: soldering iron (any kind), wire strippers, multimeter, Arduino IDE installed (link to guide), basic soldering skills (link to 10-minute tutorial)" | No prerequisites section. Step 3 says "solder the headers" and user has never soldered. |

---

## 6. Progressive Disclosure

### Core Principles

**1. Three-Tier Information Architecture**

Every build plan should be structured in three layers, disclosed progressively:

```
TIER 1: QUICK START (visible immediately)
  - What it does (1 sentence + photo)
  - Complete parts list with purchase links
  - Total cost and time estimate
  - "One screenshot" wiring overview

TIER 2: STEP-BY-STEP (expandable sections)
  - Each step with photos, wiring tables, code snippets
  - Subsystem test after each major section
  - Troubleshooting for each step
  - Alternative approaches (e.g., "no-solder version")

TIER 3: REFERENCE (linked or at bottom)
  - Full schematic (PDF, KiCad files)
  - Complete BOM with manufacturer part numbers
  - Full source code (GitHub link)
  - Design rationale ("why we chose this sensor")
  - Modification guide
```

**2. The "TLDR" for Experienced Makers + Hand-Holding for Beginners**

The same project must serve two audiences:
- An experienced maker should get what they need from Tier 1 alone (BOM + wiring overview + code link) and be building in minutes
- A beginner should be able to follow Tier 2 step-by-step and succeed on their first project

This means Tier 1 is NOT a "summary" -- it is a complete instruction set for those who know how to fill in the gaps.

**3. Skill-Level Routing**

Same project, different paths for different experience levels. This is the most powerful UX concept for a build platform:

| Skill Level | What They See | Default Path |
|-------------|---------------|--------------|
| **Beginner** | Every step expanded. Jargon explained. Prerequisites enforced. Alternative "no-soldering" paths highlighted. | Step-by-step, no skipped details |
| **Intermediate** | Steps grouped by subsystem. Assumes basic wiring/Arduino knowledge. Shows both soldered and no-solder options. | Subsystem-by-subsystem, with debug guidance |
| **Advanced** | Quick-start view. Full schematics. Links to source. Modification suggestions. | BOM + schematic + code. Build independently. |

The skill level should be user-selectable AND auto-detected based on the project's complexity and the user's profile/history.

**4. Don't Interrupt the Happy Path**

The cardinal rule of progressive disclosure: edge cases, optimizations, and advanced configuration must never interrupt the core build flow. Use expandable callouts, sidebars, or linked pages. The user should be able to follow the main path start-to-finish without ever seeing a digression.

Examples:
- "Optional: if you want to add a display..." (collapsed)
- "Advanced: optimizing battery life..." (linked page)
- "Troubleshooting: if your sensor reads 0..." (collapsed at the step where it's relevant)

**5. Link, Don't Duplicate**

A platform that generates many build plans will inevitably repeat information (how to install Arduino IDE, how to solder, what a voltage divider is). Instead of duplicating this content in every plan, maintain a canonical knowledge base and link to it. This ensures:
- Consistency across all builds
- Updates propagate everywhere
- Users who already know the material are not repeatedly shown it

### Encoding Into AI Behavior

**Prompt-level rules:**
- AI must generate three representations of every build: Quick-Start, Step-by-Step, and Reference
- AI must never include edge cases or optimizations inline in the main build flow -- only in expandable sections
- AI must auto-label every step with a difficulty indicator (beginner/intermediate/advanced)
- AI must identify canonical knowledge (installing tools, basic techniques) and link to it rather than duplicating it

**Architecture decision:**
- A "Content Router" that serves different views of the same build plan based on user skill level
- A "Canonical Knowledge Base" that stores common procedures, tool installation guides, and technique tutorials
- A "Difficulty Classifier" that scores each build step and allows dynamic filtering
- Build plans stored as structured data (JSON with tagged sections), not flat text, so views can be dynamically composed

**UI manifestation:**
- Skill level slider: beginner / intermediate / advanced (switches entire build plan presentation)
- Collapsible sections for every detail beyond the happy path
- "I know this" button to skip explanation of common procedures
- "Explain this" button to expand jargon and add context
- Each step's difficulty badge clearly visible

### Excellent vs. Poor Execution

| Excellent | Poor |
|-----------|------|
| "**Step 3: Connect the sensor (2 wires)**\n\nRed wire -> 5V pin\nBlack wire -> GND\n\n(Photo shows both connections)\n\n[Expand: What if my sensor has different color wires?]\n[Expand: Using a different sensor?]" | "Connect the sensor to the microcontroller. You may need to consult the datasheet for the correct pinout. Make sure the voltage levels are compatible." |
| Tier 1 shows: photo of finished project, BOM table with prices and links, wiring diagram, code link. An expert can build from this alone. | Everything is in one 5,000-word wall of text. The expert who just needs the pinout has to scroll through all the beginner explanations. |
| "Total time: 45 minutes (beginner), 20 minutes (experienced)" | No time estimate at all. |

---

## Synthesis: What This Means for the Platform

### The AI Pipeline Architecture

```
User Intent (text description / YouTube URL)
    |
    v
[Intent Parser] -- extracts: what to build, skill level, constraints
    |
    v
[Feasibility Classifier] -- is this a PoC, MVP, or Production build?
    |
    v
[Risk Analyzer] -- identifies riskiest assumptions, safety concerns
    |
    v
[Architecture Generator] -- proposes subsystem breakdown, test order
    |
    v
[BOM Generator + Jellybean Mapper + Sourcing Engine] -- parts list with stock check
    |
    v
[Documentation Generator] -- produces Tier 1/2/3 content
    |
    v
[Build Plan Output] -- multi-format build plan ready for user consumption
```

### Key UX Decisions

1. **Three build modes**: Quick Test (PoC), Full Build (MVP), Production (custom PCB/enclosure)
2. **Skill-level routing**: Beginner / Intermediate / Advanced toggle that restructures the entire plan
3. **Progressive disclosure everywhere**: collapsible sections, Tier 1/Tier 2/Tier 3, happy path first
4. **Debug-first design**: test points, LEDs, serial output are DEFAULT suggestions, not afterthoughts
5. **One-click sourcing**: BOM grouped by vendor, "buy everything" link, "you might already have" section
6. **Build tracking**: numbered steps with checkboxes, photo upload, "I'm stuck" troubleshooting

### The North Star User Experience

A user should be able to:
1. Describe their idea (or paste a YouTube link) in one sentence
2. See a photo of what they will build, total cost, total time, and a one-screenshot wiring overview
3. Click "Quick Test" to get the 4-hour PoC version, or "Full Build" for the complete plan
4. Have every part available with one click (ideally shipped from 1-2 vendors max)
5. Follow step-by-step instructions that include photos, expected outputs at each stage, and embedded troubleshooting
6. Build subsystem by subsystem, testing each before moving on
7. Know exactly what to do when something doesn't work (because the AI anticipated the failure modes)

---

## Sources

- [Golioth Blog: "Hardware MVP: Why Start Ugly Beats Perfect in the AI Age"](https://blog.golioth.io/hardware-mvp-why-start-ugly-beats-perfect-in-the-ai-age/)
- [IoT For All: "From Concept to Launch: Building a Lean IoT Prototype Stack"](https://www.iotforall.com/iot-prototype-stack-no-code-ai)
- [Detus: "Prototyping Speed Matters"](https://www.detus.co/hardware-design/prototyping-speed-matters-heres-how-to-balance-speed-with-quality/)
- [Embien: "Rapid Prototyping for Electronic Products & MVP Development"](https://www.embien.com/blog/rapid-prototyping-mvps-iterative-electronic-product-validation)
- [Cadence: "4 Ways to Make Your PCB Debuggable When Designing for Test"](https://resources.pcb.cadence.com/blog/4-ways-to-make-your-pcb-debuggable-when-designing-for-test)
- [Altium: "How to Design for Test in Embedded Systems"](https://resources.altium.com/p/how-design-test-embedded-systems)
- [Altium: "Entrepreneur's Guide to Modular Product Design"](https://resources.altium.com/p/entrepreneur-s-guide-to-modular-product-design-costs)
- [AISLER Community: "Our Hands-On Guide to Optimize Your BOM"](https://community.aisler.net/t/our-hands-on-guide-to-optimize-your-bill-of-material/3588)
- [DigiKey Forum: "What Are Jellybean Electronic Components?"](https://forum.digikey.com/t/what-are-jellybean-electronic-components/46180/3)
- [Hackaday: Jellybean Parts Tag](https://hackaday.com/tag/jellybean-parts/)
- [Adafruit Learn System](https://learn.adafruit.com/)
- [SaaSHub: Instructables vs Adafruit Comparison](https://www.saashub.com/compare-instructables-vs-adafruit)
- [Primer Design: Progressive Disclosure UI Pattern](https://www.primer.style/product/ui-patterns/progressive-disclosure/)
- [Mintlify: "My Quick Formula for Docs That Convert"](https://www.mintlify.com/blog/my-quick-formula-for-docs-that-convert)
- [MAWA: "How to Build an MVP That Gets Funded"](https://studiomawa.com/2025/02/17/how-to-build-an-mvp-that-gets-funded/)
