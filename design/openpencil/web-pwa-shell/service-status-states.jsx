<Frame name="ServiceStatus – states" x={2320} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" color="#182231" size={16} weight={600} lineHeight={24}>ServiceStatus (dot 8px + label 14/20 textMuted)</Text>
  <Frame name="State checking" flex="col" w="fill" gap={4}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>checking · dot textMuted #6B6B70</Text>
    <Frame name="Frame" flex="row" gap={8} items="center">
      <Ellipse name="Ellipse" w={8} h={8} bg="#6B6B70" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Checking service…</Text>
    </Frame>
  </Frame>
  <Frame name="State online" flex="col" w="fill" gap={4}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>online · dot success #2E7D4F</Text>
    <Frame name="Frame" flex="row" gap={8} items="center">
      <Ellipse name="Ellipse" w={8} h={8} bg="#2E7D4F" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Service available</Text>
    </Frame>
  </Frame>
  <Frame name="State degraded" flex="col" w="fill" gap={4}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>degraded · dot warning #B7791F</Text>
    <Frame name="Frame" flex="row" gap={8} items="center">
      <Ellipse name="Ellipse" w={8} h={8} bg="#B7791F" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Some features are temporarily unavailable</Text>
    </Frame>
  </Frame>
  <Frame name="State offline" flex="col" w="fill" gap={4}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>offline · dot danger #C0392B</Text>
    <Frame name="Frame" flex="row" gap={8} items="center">
      <Ellipse name="Ellipse" w={8} h={8} bg="#C0392B" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>You're offline or the service can't be reached</Text>
    </Frame>
  </Frame>
</Frame>