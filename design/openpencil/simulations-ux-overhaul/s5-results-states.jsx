<Frame name="S5 · AI Results – Simulation states (annotation text is normative)" x={900} y={1100} flex="col" w={420} gap={24} p={16} bg="#FAFAF8">
  <Frame name="Describing references" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>DESCRIBING REFERENCES (before the first render of a new style; skipped when the descriptions are cached)</Text>
    <Frame name="StatusCard" flex="col" w="fill" gap={12} items="center" p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Icon name="lucide:loader" size={24} color="#2968EC" />
      <Text name="Status" color="#182231" size={16} weight={600} lineHeight={24}>Studying your style references</Text>
      <Text name="Helper" w="fill" color="#6B6B70" lineHeight={20}>Indeterminate bar (static under reduced motion). Then Rendering n of N.</Text>
    </Frame>
  </Frame>
  <Frame name="Partial failure" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>PARTIAL FAILURE (successful Renders stay visible; each failed tile has its own Retry)</Text>
    <Frame name="Failed tile" flex="col" w={160} gap={8} p={8} bg="#FFFFFF" stroke="#C0392B" strokeWidth={2} rounded={12}>
      <Frame name="Row" flex="row" gap={6} items="center">
        <Icon name="lucide:circle-alert" size={16} color="#C0392B" />
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Photo 4 failed</Text>
      </Frame>
      <Frame name="Retry (44 hit area)" flex="row" h={44} gap={6} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:refresh-cw" size={16} color="#2968EC" />
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Retry</Text>
      </Frame>
    </Frame>
    <Frame name="Alert info" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={16}>
      <Icon name="lucide:info" size={20} color="#2968EC" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>1 of 6 photos could not be rendered. Retry it to be able to choose this simulation for your budget.</Text>
    </Frame>
  </Frame>
  <Frame name="All failed / interrupted" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>ALL FAILED / INTERRUPTED (primary CTA: Try again, which retries every failed Render)</Text>
    <Frame name="Alert danger" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={16}>
      <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>We couldn't create this simulation. Try again in a moment. (interrupted: This simulation was interrupted. Try again.)</Text>
    </Frame>
  </Frame>
  <Frame name="Queue full" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>GPU QUEUE FULL (429, no Simulation created)</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={16}>
      <Icon name="lucide:triangle-alert" size={20} color="#B7791F" />
      <Text name="Message" grow={1} color="#182231" lineHeight={20}>The designer is busy right now. Try again in a minute.</Text>
    </Frame>
  </Frame>
  <Frame name="Style degraded" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>STYLE DEGRADED (quiet note under the title when the style analysis failed and the dominant style was used)</Text>
    <Text name="Note" w="fill" color="#6B6B70" lineHeight={20}>We couldn't analyse all your references, so this simulation uses your main style.</Text>
  </Frame>
  <Frame name="Generate again disabled" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>GENERATE AGAIN DISABLED (reason line above the CTA, 14/20 textMuted)</Text>
    <Text name="Reasons" w="fill" color="#6B6B70" lineHeight={20}>While a simulation is running: One simulation at a time. Offline: You're offline. Reconnect to generate.</Text>
  </Frame>
  <Frame name="No photos or signed out" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>EMPTY / NOT FOUND / SIGNED OUT</Text>
    <Text name="Copy" w="fill" color="#6B6B70" lineHeight={20}>No simulation yet: primary CTA Generate my kitchen. Not found and signed out: as the owned project page (We couldn't find this kitchen project, Sign in to see this kitchen project). Offline: warning alert You're offline. Your simulations are safe; reconnect to see new ones.</Text>
  </Frame>
</Frame>