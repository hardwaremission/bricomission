<Frame name="States and connection styles (no glow)" w={1600} h={1000}>
  <Frame name="State working" x={264} y={328} w={176} h={56} bg="#101A2B" stroke="#5B9BFF" strokeWidth={2} rounded={8}>
    <Frame name="Header" w={176} h={22} bg="#0F766E" rounded={8} />
    <Frame name="Header square" y={14} w={176} h={8} bg="#0F766E" />
    <Text name="Title" x={10} y={4} color="#CCFBF1" size={12} weight="bold" lineHeight={14}>working</Text>
    <Frame name="State dot" x={160} y={7} w={8} h={8} bg="#5B9BFF" rounded={999} />
    <Text name="Sub" x={12} y={26} color="#8A9BB5" size={10} font="JetBrains Mono" lineHeight={13}>solid blue border, 2 px</Text>
    <Text name="Counter" x={12} y={40} color="#5EEAD4" size={10} font="JetBrains Mono" lineHeight={12}>render 3 of 6</Text>
  </Frame>
  <Frame name="State error" x={480} y={328} w={176} h={56} bg="#1A1017" stroke="#EF4444" strokeWidth={2} rounded={8}>
    <Frame name="Header" w={176} h={22} bg="#7F1D1D" rounded={8} />
    <Frame name="Header square" y={14} w={176} h={8} bg="#7F1D1D" />
    <Text name="Title" x={10} y={4} color="#FEE2E2" size={12} weight="bold" lineHeight={14}>error</Text>
    <Frame name="State dot" x={160} y={7} w={8} h={8} bg="#EF4444" rounded={999} />
    <Text name="Sub" x={12} y={26} color="#FCA5A5" size={10} font="JetBrains Mono" lineHeight={13}>failed: adapter_error</Text>
    <Text name="Counter" x={12} y={40} color="#FCA5A5" size={10} font="JetBrains Mono" lineHeight={12}>red for 3 s, then idle</Text>
  </Frame>
  <Frame name="Edge idle" x={48} y={660} flex="row" gap={14} items="center">
    <Frame name="Sample" w={120} h={2} bg="#2A3A55" />
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>idle: 2 px, dim</Text>
  </Frame>
  <Frame name="Edge active" x={48} y={696} flex="row" gap={14} items="center">
    <Frame name="Sample" w={120} h={3} bg="#5B9BFF">
      <Frame name="Packet" x={48} w={26} h={3} bg="#FFFFFF" />
    </Frame>
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>active: 3 px solid line in the pin-type colour plus a short white light packet that travels from source to target (about 600 ms per hop, no blur or glow); the line stays coloured until the response arrives</Text>
  </Frame>
  <Frame name="Edge response" x={48} y={732} flex="row" gap={14} items="center">
    <Frame name="Sample" w={120} h={3} bg="#4ADE80">
      <Frame name="Packet" x={48} w={26} h={3} bg="#FFFFFF" />
    </Frame>
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>response: the packet travels back (line green); fades out over 1 s</Text>
  </Frame>
  <Frame name="Edge simulated" x={48} y={768} flex="row" gap={14} items="center">
    <Frame name="Sample" flex="row" w={120} gap={6} items="center">
      <Frame name="d1" w={20} h={3} bg="#A78BFA" />
      <Frame name="d2" w={20} h={3} bg="#A78BFA" />
      <Frame name="d3" w={20} h={3} bg="#A78BFA" />
      <Frame name="d4" w={20} h={3} bg="#A78BFA" />
    </Frame>
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>simulated: dashed, fake adapter (no GPU traffic); legend entry explains it</Text>
  </Frame>
  <Frame name="Edge error" x={48} y={804} flex="row" gap={14} items="center">
    <Frame name="Sample" flex="row" w={120} h={3} items="center" bg="#EF4444">
      <Frame name="X mark" position="absolute" x={54} y={0} w={12} h={3} bg="#FFFFFF" />
    </Frame>
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>error: solid red for 3 s with an X mark at the midpoint, the target node turns red</Text>
  </Frame>
  <Frame name="Edge reduced motion" x={48} y={840} flex="row" gap={14} items="center">
    <Frame name="Sample" flex="row" w={120} gap={14} items="center">
      <Frame name="p1" w={8} h={3} bg="#FFFFFF" />
      <Frame name="p2" w={8} h={3} bg="#FFFFFF" />
      <Frame name="p3" w={8} h={3} bg="#FFFFFF" />
    </Frame>
    <Text name="T" color="#CBD5E1" size={11} lineHeight={14}>reduced motion: no travelling packet, three fixed white marks on the lit line; the log carries the narration</Text>
  </Frame>
  <Frame name="Routing rule" x={48} y={884} flex="col" w={1100} gap={4} p={12} bg="#101A2B" stroke="#2A3A55" rounded={8}>
    <Text name="Title" color="#E6EDF7" size={12} weight="bold" lineHeight={16}>ROUTING RULE (normative)</Text>
    <Text name="Body" w="fill" color="#CBD5E1" size={11} lineHeight={16}>Every connection is made of horizontal and vertical segments with 90 degree corners only. Lines run in the gutters between node columns (about 6 px between parallel lines) and in free channels above and below the graph for long connections. They never pass over or under a node, widget, legend or comment-box title. Crossings between two lines are allowed and are always perpendicular. Implement with an orthogonal layered layout (elkjs, ELK layered, orthogonal edge routing, one port per pin) and compare the result against the node boxes in a test.</Text>
  </Frame>
</Frame>