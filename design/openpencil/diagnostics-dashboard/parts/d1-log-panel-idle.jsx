<Frame name="Log panel content (idle, empty state)" w={560} h={1024}>
  <Frame name="Log header" flex="row" w={560} h={52} justify="between" items="center" py={0} px={16} bg="#0E1626" stroke="#1C2A44">
    <Frame name="Left" flex="row" gap={10} items="center">
      <Icon name="lucide:terminal" size={16} color="#9DB4D8" />
      <Text name="Title" color="#E6EDF7" weight="bold" lineHeight={18}>Event log</Text>
      <Frame name="Count" flex="row" h={20} items="center" py={0} px={8} bg="#16233A" rounded={999}>
        <Text name="T" color="#9DB4D8" size={11} font="JetBrains Mono" weight="bold" lineHeight={14}>0</Text>
      </Frame>
    </Frame>
    <Frame name="Controls" flex="row" gap={8} items="center">
      <Frame name="Pause" flex="row" w={32} h={32} justify="center" items="center" bg="#16233A" stroke="#2A3A55" rounded={8}>
        <Icon name="lucide:pause" size={14} color="#9DB4D8" />
      </Frame>
      <Frame name="Clear" flex="row" w={32} h={32} justify="center" items="center" bg="#16233A" stroke="#2A3A55" rounded={8}>
        <Icon name="lucide:trash-2" size={14} color="#9DB4D8" />
      </Frame>
      <Frame name="Collapse (log to 44 px rail)" flex="row" w={32} h={32} justify="center" items="center" bg="#16233A" stroke="#2A3A55" rounded={8}>
        <Icon name="lucide:panel-right-close" size={14} color="#9DB4D8" />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Filter row (kind chips)" y={52} flex="row" w={560} h={44} gap={8} items="center" py={0} px={16} bg="#0E1626" stroke="#1C2A44">
    <Frame name="Chip All" flex="row" h={26} items="center" py={0} px={10} bg="#2968EC" rounded={999}>
      <Text name="T" color="#FFFFFF" size={11} weight="bold" lineHeight={14}>All</Text>
    </Frame>
    <Frame name="Chip llm" flex="row" h={26} gap={6} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#A78BFA" rounded={999} />
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>llm</Text>
    </Frame>
    <Frame name="Chip image" flex="row" h={26} gap={6} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#F472B6" rounded={999} />
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>image</Text>
    </Frame>
    <Frame name="Chip queue" flex="row" h={26} gap={6} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#FACC15" rounded={999} />
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>queue</Text>
    </Frame>
    <Frame name="Chip sql" flex="row" h={26} gap={6} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#F5A524" rounded={999} />
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>sql</Text>
    </Frame>
    <Frame name="Chip http" flex="row" h={26} gap={6} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Frame name="Dot" w={8} h={8} bg="#4F8EF7" rounded={999} />
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>http</Text>
    </Frame>
    <Frame name="Chip more" flex="row" h={26} gap={4} items="center" py={0} px={10} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Text name="T" color="#CBD5E1" size={11} weight={600} lineHeight={14}>+7</Text>
      <Icon name="lucide:chevron-down" size={12} color="#9DB4D8" />
    </Frame>
  </Frame>
  <Frame name="Empty state" y={380} flex="col" w={560} gap={12} items="center" py={0} px={64}>
    <Icon name="lucide:radio" size={36} color="#2A3A55" />
    <Text name="Title" color="#E6EDF7" size={16} weight="bold" lineHeight={22}>Waiting for activity</Text>
    <Text name="Body" w={420} color="#8A9BB5" size={13} lineHeight={20}>Open the app in the other browser and run a Simulation or a Budget. Every call between the modules will be narrated here, line by line.</Text>
  </Frame>
  <Frame name="Log footer" y={980} flex="row" w={560} h={44} justify="between" items="center" py={0} px={16} bg="#0E1626" stroke="#1C2A44">
    <Text name="Status" color="#8A9BB5" size={11} font="JetBrains Mono" lineHeight={14}>buffer 0 / 1000 · stream connected</Text>
    <Frame name="Jump to live (disabled while live)" flex="row" h={28} gap={6} items="center" py={0} px={12} bg="#16233A" stroke="#2A3A55" rounded={999}>
      <Icon name="lucide:arrow-down-to-line" size={14} color="#64748B" />
      <Text name="T" color="#64748B" size={12} weight={600} lineHeight={16}>Jump to live</Text>
    </Frame>
  </Frame>
</Frame>