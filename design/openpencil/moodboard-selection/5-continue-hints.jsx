<Frame name="5 · Continue hints (bottom bar)" x={1800} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Continue needs at least 1 moodboard item and a complete Capture (1+ photo, all three measurements)</Text>
  <Text name="Label no items" color="#6B6B70" size={12} weight={600} lineHeight={16}>no items yet</Text>
  <Frame name="Bar no items" flex="col" w="fill" gap={12} pt={12} pr={16} pb={16} pl={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
    <Text name="Hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Add at least one kitchen or photo to continue.</Text>
    <Frame name="Continue – disabled" flex="row" h={52} w="fill" justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Continue</Text>
    </Frame>
  </Frame>
  <Text name="Label capture incomplete" color="#6B6B70" size={12} weight={600} lineHeight={16}>items added, Capture incomplete</Text>
  <Frame name="Bar capture incomplete" flex="col" w="fill" gap={8} pt={12} pr={16} pb={16} pl={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
    <Text name="Hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Your kitchen still needs a photo and all three measurements.</Text>
    <Frame name="Link 'Go to your kitchen' (to Capture, 44 tall)" flex="row" h={44} w="fill" gap={4} justify="center" items="center">
      <Icon name="lucide:arrow-left" size={16} color="#2968EC" />
      <Text name="Text" color="#2968EC" weight={600} lineHeight={20} textDecoration="underline">Go to your kitchen</Text>
    </Frame>
    <Frame name="Continue – disabled" flex="row" h={52} w="fill" justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Continue</Text>
    </Frame>
  </Frame>
  <Text name="Rule" w="fill" color="#6B6B70" size={12} lineHeight={16}>When both are missing, the Capture hint wins. Enabled Continue (frame 2) shows the save status above it and goes to /kitchen-projects/new/generate. The back button returns to Capture.</Text>
</Frame>