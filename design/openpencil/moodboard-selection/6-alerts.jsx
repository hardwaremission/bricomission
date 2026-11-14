<Frame name="6 · Alerts (above the title, same component as Capture)" x={2260} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Page alerts and save status: same component, rules and save-status variants as Capture</Text>
  <Text name="Label offline" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>offline · add tile, remove buttons and gallery tiles disabled (filter chips still filter what is loaded); thumbnails not loaded show the placeholder; Continue disabled</Text>
  <Frame name="Alert warning offline" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={12}>
    <Icon name="lucide:cloud-off" size={20} color="#B7791F" />
    <Text name="Text" grow={1} color="#182231" lineHeight={20}>You're offline. What you've saved is safe; reconnect to keep going.</Text>
  </Frame>
  <Text name="Label expired" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>draft expired · info, dismissible (Close 44), on an empty moodboard</Text>
  <Frame name="Alert info expired" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2968EC" rounded={12}>
    <Icon name="lucide:info" size={20} color="#2968EC" />
    <Text name="Text" grow={1} color="#182231" lineHeight={20}>Your previous draft expired after 7 days without changes. Start again.</Text>
  </Frame>
</Frame>