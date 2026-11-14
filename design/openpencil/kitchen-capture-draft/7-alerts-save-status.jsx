<Frame name="7 · Alerts and save status" x={1000} y={1110} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w={372} color="#1C1C1E" size={16} weight={600} lineHeight={24}>Page alerts (above the Intro title, role=status/alert) and save status (bottom bar, aria-live=polite)</Text>
  <Frame name="Offline" flex="col" w="fill" gap={8}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>offline · warning alert; add tile, remove buttons, unit toggle and inputs disabled; thumbnails not yet loaded show the placeholder; Continue disabled</Text>
    <Frame name="Alert warning offline" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={12}>
      <Icon name="lucide:cloud-off" size={20} color="#B7791F" />
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>You're offline. What you've saved is safe; reconnect to keep going.</Text>
    </Frame>
  </Frame>
  <Frame name="Draft expired" flex="col" w="fill" gap={8}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>draft expired · info alert on an empty capture screen, dismissible (Close 44)</Text>
    <Frame name="Alert info expired" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#1F4E79" rounded={12}>
      <Icon name="lucide:info" size={20} color="#1F4E79" />
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>Your previous draft expired after 7 days without changes. Start again.</Text>
    </Frame>
  </Frame>
  <Frame name="Save status variants" flex="col" w="fill" gap={10}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>save status (14/20 textMuted, centered)</Text>
    <Frame name="Frame" flex="row" gap={6} items="center">
      <Icon name="lucide:loader" size={16} color="#6B6B70" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Saving…</Text>
    </Frame>
    <Frame name="Frame" flex="row" gap={6} items="center">
      <Icon name="lucide:check" size={16} color="#2E7D4F" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Saved</Text>
    </Frame>
    <Frame name="Frame" flex="row" gap={6} items="center">
      <Icon name="lucide:cloud-off" size={16} color="#B7791F" />
      <Text name="Text" color="#6B6B70" lineHeight={20}>Not saved: you're offline</Text>
    </Frame>
    <Frame name="Frame" flex="row" gap={6} items="center">
      <Icon name="lucide:circle-alert" size={16} color="#C0392B" />
      <Text name="Text" w={346} color="#6B6B70" lineHeight={20}>Not saved: try again in a moment (server rejected or unavailable).</Text>
    </Frame>
  </Frame>
  <Frame name="Units cm" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>cm selected · suffix "cm", whole numbers, placeholder "0"; values convert when toggling</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Range hint: "Length and width between 100 and 2000 cm · height between 180 and 600 cm". Validation happens inside the measurement keypad (the page fields only receive valid values).</Text>
  </Frame>
</Frame>