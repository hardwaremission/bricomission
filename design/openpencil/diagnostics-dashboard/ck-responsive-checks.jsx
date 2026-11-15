<Frame name="CK · Responsive checks (schematic, shown at 50 percent; annotation text is normative)" x={1300} flex="col" w={1500} gap={24} p={32} bg="#0B1220">
  <Text name="Rules" w="fill" color="#CBD5E1" size={12} lineHeight={18}>Layout rules. 1920x1080 (reference): graph 1360 wide, log 560 wide, legend open at the bottom left of the canvas. 1440x1080: log 480 wide, legend collapsed into the header button, graph in fit-view (zoom about 0.7). 1366x768: log 400 wide, legend collapsed, graph fit-view (zoom about 0.7, widgets stay legible because they are 9 px minimum). Below 1280 px the log starts collapsed. The graph always starts in fit-view and the Fit button restores it. Everything below is drawn at 50 percent.</Text>
  <Frame name="Row" flex="row" gap={32}>
    <Frame name="CK1 · 1440x1080, log 480 expanded" flex="col" gap={8}>
      <Text name="Label" color="#8A9BB5" size={11} weight="bold" lineHeight={14}>1440 x 1080 · log expanded</Text>
      <Frame name="Screen" w={720} h={540} bg="#080E1A" stroke="#2A3A55">
        <Frame name="Header" w={720} h={28} bg="#0E1626" stroke="#1C2A44">
          <Text name="T" x={10} y={8} color="#9DB4D8" size={9} weight="bold" lineHeight={12}>BricoMission · DIAGNOSTICS     host strip     LIVE · Legend (collapsed)</Text>
        </Frame>
        <Frame name="Canvas" y={28} w={480} h={512} bg="#0B1220">
          <Frame name="Box Client" x={4} y={170} w={49} h={53} bg="#121A29" stroke="#2F394B" rounded={4} />
          <Frame name="Box Web" x={57} y={150} w={66} h={91} bg="#0D1930" stroke="#173471" rounded={4} />
          <Frame name="Box API" x={127} y={80} w={223} h={305} bg="#0B1A27" stroke="#0F5456" rounded={5} />
          <Frame name="Box Identity" x={354} y={80} w={118} h={57} bg="#1B1524" stroke="#5C2235" rounded={4} />
          <Frame name="Box Data" x={354} y={143} w={118} h={57} bg="#1B1C1E" stroke="#5D431C" rounded={4} />
          <Frame name="Box AI" x={354} y={206} w={118} h={217} bg="#14172F" stroke="#372C6B" rounded={4} />
          <Text name="Zoom" x={8} y={490} color="#64748B" size={9} font="JetBrains Mono" lineHeight={12}>fit-view zoom 0.70</Text>
        </Frame>
        <Frame name="Log" x={480} y={28} w={240} h={512} bg="#0E1626" stroke="#1C2A44">
          <Text name="T" x={10} y={10} color="#9DB4D8" size={9} weight="bold" lineHeight={12}>Event log (480)</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="CK2 · 1366x768, log 400 expanded" flex="col" gap={8}>
      <Text name="Label" color="#8A9BB5" size={11} weight="bold" lineHeight={14}>1366 x 768 · log expanded</Text>
      <Frame name="Screen" w={683} h={384} bg="#080E1A" stroke="#2A3A55">
        <Frame name="Header" w={683} h={28} bg="#0E1626" stroke="#1C2A44">
          <Text name="T" x={10} y={8} color="#9DB4D8" size={9} weight="bold" lineHeight={12}>BricoMission · DIAGNOSTICS     host strip     LIVE · Legend (collapsed)</Text>
        </Frame>
        <Frame name="Canvas" y={28} w={483} h={356} bg="#0B1220">
          <Frame name="Box Client" x={6} y={134} w={49} h={53} bg="#121A29" stroke="#2F394B" rounded={4} />
          <Frame name="Box Web" x={59} y={116} w={65} h={91} bg="#0D1930" stroke="#173471" rounded={4} />
          <Frame name="Box API" x={127} y={6} w={221} h={303} bg="#0B1A27" stroke="#0F5456" rounded={5} />
          <Frame name="Box Identity" x={354} y={6} w={117} h={57} bg="#1B1524" stroke="#5C2235" rounded={4} />
          <Frame name="Box Data" x={354} y={69} w={117} h={57} bg="#1B1C1E" stroke="#5D431C" rounded={4} />
          <Frame name="Box AI" x={354} y={132} w={117} h={216} bg="#14172F" stroke="#372C6B" rounded={4} />
        </Frame>
        <Frame name="Log" x={483} y={28} w={200} h={356} bg="#0E1626" stroke="#1C2A44">
          <Text name="T" x={10} y={10} color="#9DB4D8" size={9} weight="bold" lineHeight={12}>Event log (400)</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="CK3 · 1366x768, log collapsed" flex="col" gap={8}>
      <Text name="Label" color="#8A9BB5" size={11} weight="bold" lineHeight={14}>1366 x 768 · log collapsed (rail 44)</Text>
      <Frame name="Screen" w={683} h={384} bg="#080E1A" stroke="#2A3A55">
        <Frame name="Header" w={683} h={28} bg="#0E1626" stroke="#1C2A44">
          <Text name="T" x={10} y={8} color="#9DB4D8" size={9} weight="bold" lineHeight={12}>BricoMission · DIAGNOSTICS     host strip     LIVE · Legend (collapsed)</Text>
        </Frame>
        <Frame name="Canvas" y={28} w={661} h={356} bg="#0B1220">
          <Frame name="Box Client" x={106} y={134} w={49} h={53} bg="#121A29" stroke="#2F394B" rounded={4} />
          <Frame name="Box Web" x={159} y={116} w={65} h={91} bg="#0D1930" stroke="#173471" rounded={4} />
          <Frame name="Box API" x={227} y={6} w={221} h={303} bg="#0B1A27" stroke="#0F5456" rounded={5} />
          <Frame name="Box Identity" x={454} y={6} w={117} h={57} bg="#1B1524" stroke="#5C2235" rounded={4} />
          <Frame name="Box Data" x={454} y={69} w={117} h={57} bg="#1B1C1E" stroke="#5D431C" rounded={4} />
          <Frame name="Box AI" x={454} y={132} w={117} h={216} bg="#14172F" stroke="#372C6B" rounded={4} />
        </Frame>
        <Frame name="Rail" x={661} y={28} w={22} h={356} bg="#0E1626" stroke="#1C2A44">
          <Frame name="Badge" x={2} y={8} w={18} h={10} bg="#2968EC" rounded={999} />
        </Frame>
      </Frame>
    </Frame>
  </Frame>
</Frame>