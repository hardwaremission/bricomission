<Frame name="Global legend (open; collapsible from the header Legend button)" x={8} y={596} flex="col" w={284} gap={10} p={12} bg="#0E1626" stroke="#2A3A55" rounded={12}>
  <Frame name="Header" flex="row" w="fill" justify="between" items="center">
    <Text name="Title" color="#E6EDF7" size={12} weight="bold" lineHeight={16}>LEGEND</Text>
    <Icon name="lucide:chevron-down" size={14} color="#8A9BB5" />
  </Frame>
  <Frame name="Pin types" flex="col" w="fill" gap={5}>
    <Text name="Label" color="#8A9BB5" size={10} weight="bold" lineHeight={13}>PIN TYPES (what flows through)</Text>
    <Frame name="Row 1" flex="row" w="fill" gap={6}>
      <Frame name="http" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#4F8EF7" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>http</Text>
      </Frame>
      <Frame name="sql" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#F5A524" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>sql</Text>
      </Frame>
      <Frame name="object" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#FB923C" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>object</Text>
      </Frame>
    </Frame>
    <Frame name="Row 2" flex="row" w="fill" gap={6}>
      <Frame name="llm" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#A78BFA" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>llm</Text>
      </Frame>
      <Frame name="image" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#F472B6" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>image</Text>
      </Frame>
      <Frame name="embed" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#22D3EE" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>embed</Text>
      </Frame>
    </Frame>
    <Frame name="Row 3" flex="row" w="fill" gap={6}>
      <Frame name="auth" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#F87171" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>auth</Text>
      </Frame>
      <Frame name="mail" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#4ADE80" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>mail</Text>
      </Frame>
      <Frame name="queue" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#FACC15" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>queue</Text>
      </Frame>
    </Frame>
    <Frame name="Row 4" flex="row" w="fill" gap={6}>
      <Frame name="compute" flex="row" w={80} gap={5} items="center">
        <Frame name="Dot" w={9} h={9} bg="#5EEAD4" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} font="JetBrains Mono" lineHeight={13}>compute</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="API module groups" flex="col" w="fill" gap={5}>
    <Text name="Label" color="#8A9BB5" size={10} weight="bold" lineHeight={13}>API MODULE GROUPS (left strip)</Text>
    <Frame name="Row" flex="row" w="fill" gap={8} wrap rowGap={5}>
      <Frame name="REQ" flex="row" gap={5} items="center">
        <Frame name="Bar" w={3} h={11} bg="#14B8A6" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>request</Text>
      </Frame>
      <Frame name="GEN" flex="row" gap={5} items="center">
        <Frame name="Bar" w={3} h={11} bg="#84CC16" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>generation</Text>
      </Frame>
      <Frame name="BUD" flex="row" gap={5} items="center">
        <Frame name="Bar" w={3} h={11} bg="#38BDF8" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>budget</Text>
      </Frame>
      <Frame name="GPU" flex="row" gap={5} items="center">
        <Frame name="Bar" w={3} h={11} bg="#FACC15" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>GPU</Text>
      </Frame>
      <Frame name="INF" flex="row" gap={5} items="center">
        <Frame name="Bar" w={3} h={11} bg="#94A3B8" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>infra clients</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Connection states" flex="col" w="fill" gap={5}>
    <Text name="Label" color="#8A9BB5" size={10} weight="bold" lineHeight={13}>CONNECTIONS</Text>
    <Frame name="Idle" flex="row" gap={8} items="center">
      <Frame name="Sample" w={36} h={2} bg="#2A3A55" />
      <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>idle</Text>
    </Frame>
    <Frame name="Active" flex="row" gap={8} items="center">
      <Frame name="Sample" flex="row" w={36} h={3} items="center" bg="#5B9BFF">
        <Frame name="Packet" position="absolute" x={10} y={0} w={14} h={3} bg="#FFFFFF" />
      </Frame>
      <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>active: coloured line + white packet</Text>
    </Frame>
    <Frame name="Response" flex="row" gap={8} items="center">
      <Frame name="Sample" flex="row" w={36} h={3} items="center" bg="#4ADE80">
        <Frame name="Packet" position="absolute" x={10} y={0} w={14} h={3} bg="#FFFFFF" />
      </Frame>
      <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>response: packet comes back</Text>
    </Frame>
    <Frame name="Simulated" flex="row" gap={8} items="center">
      <Frame name="Sample" flex="row" w={36} gap={3} items="center">
        <Frame name="d1" w={7} h={3} bg="#A78BFA" />
        <Frame name="d2" w={7} h={3} bg="#A78BFA" />
        <Frame name="d3" w={7} h={3} bg="#A78BFA" />
        <Frame name="d4" w={7} h={3} bg="#A78BFA" />
      </Frame>
      <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>dashed: simulated (fake adapter)</Text>
    </Frame>
    <Frame name="Error" flex="row" gap={8} items="center">
      <Frame name="Sample" w={36} h={3} bg="#EF4444" />
      <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>error: red for 3 s</Text>
    </Frame>
  </Frame>
  <Frame name="Node states and metrics" flex="col" w="fill" gap={5}>
    <Text name="Label" color="#8A9BB5" size={10} weight="bold" lineHeight={13}>NODES AND METRICS</Text>
    <Frame name="Row" flex="row" w="fill" gap={10} items="center">
      <Frame name="Idle" flex="row" gap={4} items="center">
        <Frame name="Dot" w={8} h={8} bg="#475569" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>idle</Text>
      </Frame>
      <Frame name="Working" flex="row" gap={4} items="center">
        <Frame name="Dot" w={8} h={8} bg="#5B9BFF" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>working</Text>
      </Frame>
      <Frame name="Error" flex="row" gap={4} items="center">
        <Frame name="Dot" w={8} h={8} bg="#EF4444" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>error</Text>
      </Frame>
      <Frame name="Off" flex="row" gap={4} items="center">
        <Frame name="Dot" w={8} h={8} bg="#1E293B" stroke="#7E8DA6" rounded={999} />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>offline</Text>
      </Frame>
    </Frame>
    <Frame name="Metric colours" flex="row" w="fill" gap={8} items="center">
      <Frame name="CPU" flex="row" gap={4} items="center">
        <Frame name="Bar" w={12} h={4} bg="#5B9BFF" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>CPU</Text>
      </Frame>
      <Frame name="RAM" flex="row" gap={4} items="center">
        <Frame name="Bar" w={12} h={4} bg="#4ADE80" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>RAM</Text>
      </Frame>
      <Frame name="VRAM" flex="row" gap={4} items="center">
        <Frame name="Bar" w={12} h={4} bg="#A78BFA" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>VRAM</Text>
      </Frame>
      <Frame name="GPU" flex="row" gap={4} items="center">
        <Frame name="Bar" w={12} h={4} bg="#FACC15" />
        <Text name="T" color="#CBD5E1" size={10} lineHeight={13}>GPU</Text>
      </Frame>
    </Frame>
    <Text name="Notes" w="fill" color="#8A9BB5" size={10} lineHeight={13}>n/a = not measurable. shared = whole API container. approx = estimate.</Text>
  </Frame>
</Frame>