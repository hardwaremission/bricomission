<Frame name="Log rail content (collapsed)" flex="col" h={1024} w={44} gap={12} items="center" py={10} px={0} bg="#0E1626">
  <Frame name="Expand (panel-right-open)" flex="row" w={32} h={32} justify="center" items="center" bg="#16233A" stroke="#2A3A55" rounded={8}>
    <Icon name="lucide:panel-right-open" size={14} color="#9DB4D8" />
  </Frame>
  <Frame name="Unread badge (new events since collapsing)" flex="row" h={20} items="center" py={0} px={7} bg="#2968EC" rounded={999}>
    <Text name="T" color="#FFFFFF" size={11} font="JetBrains Mono" weight="bold" lineHeight={14}>+41</Text>
  </Frame>
  <Frame name="Live dot" w={8} h={8} bg="#4ADE80" rounded={999} shadow="0 0 8 #4ADE80" />
  <Icon name="lucide:terminal" size={16} color="#64748B" />
  <Frame name="Tick 1" w={20} h={2} bg="#2A3A55" rounded={999} />
  <Frame name="Tick 2" w={14} h={2} bg="#2A3A55" rounded={999} />
  <Frame name="Tick 3" w={20} h={2} bg="#2A3A55" rounded={999} />
  <Frame name="Tick 4 (latest, brighter)" w={16} h={2} bg="#5B9BFF" rounded={999} shadow="0 0 6 #5B9BFF" />
</Frame>