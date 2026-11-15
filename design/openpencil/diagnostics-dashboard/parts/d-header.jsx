<Frame name="Header" flex="row" w={1920} h={56} justify="between" items="center" py={0} px={20} bg="#0E1626" stroke="#1C2A44">
  <Frame name="Brand" flex="row" gap={12} items="center">
    <Frame name="Mark" flex="row" w={28} h={28} justify="center" items="center" bg="#2968EC" rounded={8}>
      <Icon name="lucide:activity" size={16} color="#FFFFFF" />
    </Frame>
    <Text name="Title" color="#E6EDF7" size={16} weight="bold" lineHeight={20}>BricoMission</Text>
    <Frame name="Tag Diagnostics" flex="row" h={24} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Text name="Text" color="#9DB4D8" size={12} weight={600} lineHeight={16}>DIAGNOSTICS</Text>
    </Frame>
  </Frame>
  <Frame name="Host strip (global totals)" flex="row" gap={24} items="center">
    <Frame name="Host CPU" flex="col" w={120} gap={4}>
      <Frame name="Row" flex="row" w="fill" justify="between">
        <Text name="Label" color="#8A9BB5" size={11} weight={600} lineHeight={14}>CPU</Text>
        <Text name="Value" color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>23%</Text>
      </Frame>
      <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={28} h={4} bg="#5B9BFF" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Host RAM" flex="col" w={150} gap={4}>
      <Frame name="Row" flex="row" w="fill" justify="between">
        <Text name="Label" color="#8A9BB5" size={11} weight={600} lineHeight={14}>RAM</Text>
        <Text name="Value" color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>31.4 / 64 GB</Text>
      </Frame>
      <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={74} h={4} bg="#4ADE80" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Host VRAM" flex="col" w={150} gap={4}>
      <Frame name="Row" flex="row" w="fill" justify="between">
        <Text name="Label" color="#8A9BB5" size={11} weight={600} lineHeight={14}>VRAM</Text>
        <Text name="Value" color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>12.3 / 16 GB</Text>
      </Frame>
      <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={80} h={4} bg="#A78BFA" rounded={999} />
      </Frame>
    </Frame>
    <Frame name="Host GPU" flex="col" w={120} gap={4}>
      <Frame name="Row" flex="row" w="fill" justify="between">
        <Text name="Label" color="#8A9BB5" size={11} weight={600} lineHeight={14}>GPU</Text>
        <Text name="Value" color="#E6EDF7" size={11} font="JetBrains Mono" weight={600} lineHeight={14}>87%</Text>
      </Frame>
      <Frame name="Track" w="fill" h={4} bg="#16233A" rounded={999}>
        <Frame name="Fill" w={2} h={4} bg="#FACC15" rounded={999} />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Right controls" flex="row" gap={12} items="center">
    <Frame name="Status chip LIVE" flex="row" h={28} gap={8} items="center" py={0} px={12} bg="#0F2A1E" stroke="#1F6B45" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#4ADE80" rounded={999} />
      <Text name="Text" color="#86EFAC" size={12} weight="bold" lineHeight={16}>LIVE</Text>
    </Frame>
    <Frame name="Legend button" flex="row" h={32} gap={8} items="center" py={0} px={12} bg="#16233A" stroke="#2A3A55" rounded={8}>
      <Icon name="lucide:layout-list" size={16} color="#9DB4D8" />
      <Text name="Text" color="#E6EDF7" size={13} weight={600} lineHeight={18}>Legend</Text>
    </Frame>
    <Frame name="Fit view button" flex="row" w={32} h={32} justify="center" items="center" bg="#16233A" stroke="#2A3A55" rounded={8}>
      <Icon name="lucide:scan" size={16} color="#9DB4D8" />
    </Frame>
  </Frame>
</Frame>