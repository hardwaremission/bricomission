<Frame name="Sign-in problem – reasons" x={1880} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w={372} color="#1C1C1E" size={16} weight={600} lineHeight={24}>/auth/error reasons (same layout; only the helper text changes)</Text>
  <Frame name="Frame" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>cancelled</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>You cancelled signing in. You can try again whenever you're ready.</Text>
  </Frame>
  <Frame name="Frame" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>expired</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Your sign-in link expired. Start again to continue.</Text>
  </Frame>
  <Frame name="Frame" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>unavailable</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Sign-in is temporarily unavailable. Please try again in a few minutes.</Text>
  </Frame>
  <Frame name="Frame" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>generic</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Something went wrong while signing you in. Please try again.</Text>
  </Frame>
</Frame>