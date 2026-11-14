<Frame name="4 · Budget states panel (annotation text is normative)" x={1350} flex="col" w={390} gap={24} p={16} bg="#FAFAF8">
  <Frame name="Queued" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>QUEUED</Text>
    <Frame name="StatusCard queued" flex="col" w="fill" gap={12} items="center" p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Icon name="lucide:hourglass" size={24} color="#2968EC" />
      <Text name="Status" color="#182231" size={16} weight={600} lineHeight={24}>Waiting for the GPU</Text>
      <Text name="Position (omitted when unknown or 0)" color="#6B6B70" lineHeight={20}>1 job ahead of yours</Text>
    </Frame>
  </Frame>
  <Frame name="Empty / first run" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>FIRST RUN (no budget yet, project complete)</Text>
    <Frame name="EmptyCard" flex="col" w="fill" gap={12} items="center" p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Icon name="lucide:receipt-text" size={24} color="#2968EC" />
      <Text name="Title" color="#182231" size={16} weight={600} lineHeight={24}>No budget yet</Text>
      <Text name="Helper" w="fill" color="#6B6B70" lineHeight={20}>Get four options for your kitchen, from premium to essential. Primary CTA: Get my budget.</Text>
    </Frame>
  </Frame>
  <Frame name="Failed / interrupted" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>FAILED / INTERRUPTED (CTA label: Try again)</Text>
    <Frame name="Alert danger" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={16}>
      <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>We couldn't calculate this budget. Try again in a moment. (interrupted: This budget was interrupted. Try again.)</Text>
    </Frame>
  </Frame>
  <Frame name="Catalog empty / embedder down" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>CATALOG EMPTY (409) / SEARCH UNAVAILABLE (503)</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={16}>
      <Icon name="lucide:triangle-alert" size={20} color="#B7791F" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>The product catalog isn't ready yet. Try again later. (503: The price search is unavailable right now. Try again in a minute.)</Text>
    </Frame>
  </Frame>
  <Frame name="GPU queue full (429)" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>GPU QUEUE FULL (429, no budget created)</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={16}>
      <Icon name="lucide:triangle-alert" size={20} color="#B7791F" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>The designer is busy right now. Try again in a minute.</Text>
    </Frame>
  </Frame>
  <Frame name="Limit reached (5)" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>LIMIT REACHED (5 budgets; Calculate again disabled)</Text>
    <Text name="Hint" w="fill" color="#6B6B70" lineHeight={20}>You've created 5 budgets, the maximum for this project.</Text>
  </Frame>
  <Frame name="Project incomplete (409)" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>PROJECT INCOMPLETE (409 project_incomplete)</Text>
    <Frame name="Alert info" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={16}>
      <Icon name="lucide:info" size={20} color="#2968EC" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>Add your photos and measurements first, then get your budget.</Text>
    </Frame>
  </Frame>
  <Frame name="Offline" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>OFFLINE (CTAs disabled; polling pauses and resumes)</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={16}>
      <Icon name="lucide:triangle-alert" size={20} color="#B7791F" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>You're offline. Your budgets are safe; reconnect to see new ones.</Text>
    </Frame>
  </Frame>
  <Frame name="Not found / not owner / signed out" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>NOT FOUND / SIGNED OUT</Text>
    <Text name="Copy" w="fill" color="#6B6B70" lineHeight={20}>As the owned page: We couldn't find this kitchen project / Sign in to see this kitchen project.</Text>
  </Frame>
</Frame>