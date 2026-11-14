<Frame name="S10 · Budget – states (annotation text is normative)" y={1400} flex="col" w={420} gap={24} p={16} bg="#FAFAF8">
  <Frame name="Computing" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>COMPUTING (title: Calculating your budget; stage line changes)</Text>
    <Frame name="StatusCard" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Frame name="Row" flex="row" gap={8} items="center">
        <Icon name="lucide:loader" size={24} color="#2968EC" />
        <Text name="Stage" color="#182231" size={16} weight={600} lineHeight={24}>Reading image 2 of 6</Text>
      </Frame>
      <Frame name="Track" w="fill" h={6} bg="#E2E0DA" rounded={999}>
        <Frame name="Fill" w={110} h={6} bg="#2968EC" rounded={999} />
      </Frame>
      <Text name="Next stage" color="#6B6B70" lineHeight={20}>Next stage line: Matching products in the catalog. Waiting stage: Waiting for the GPU.</Text>
    </Frame>
    <Text name="Recompute" w="fill" color="#6B6B70" lineHeight={20}>Recalculating: the previous budget stays visible below a banner Calculating a new budget, and is replaced only when the new one succeeds. The buttons are disabled with the hint One budget at a time.</Text>
  </Frame>
  <Frame name="No selection" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>NO SIMULATION SELECTED (409 no_simulation_selected)</Text>
    <Frame name="Alert info" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={16}>
      <Icon name="lucide:info" size={20} color="#2968EC" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>Select a simulation in your kitchen project to get a budget. Link: Go to my simulations.</Text>
    </Frame>
  </Frame>
  <Frame name="Simulation not ready" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>SIMULATION NOT READY (409 simulation_not_ready)</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={16}>
      <Icon name="lucide:triangle-alert" size={20} color="#B7791F" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>This simulation still has photos that were not rendered. Retry them first.</Text>
    </Frame>
  </Frame>
  <Frame name="Failed" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>FAILED / INTERRUPTED (CTA label Try again)</Text>
    <Frame name="Alert danger" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={16}>
      <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>We couldn't calculate this budget. Try again in a moment. (interrupted: This budget was interrupted. Try again.)</Text>
    </Frame>
  </Frame>
  <Frame name="Other states unchanged" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>UNCHANGED FROM THE APPROVED BUDGET DESIGN</Text>
    <Text name="Copy" w="fill" color="#6B6B70" lineHeight={20}>Tier expansion with Line Items and citations, totals block, catalog empty, search unavailable, GPU queue full, offline, not found and signed out. The Your budgets history strip and the Calculate again / limit rules are REMOVED (one current budget per simulation).</Text>
  </Frame>
</Frame>