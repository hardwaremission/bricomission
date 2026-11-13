<Frame name="Message page – states" x={3320} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w={372} color="#1C1C1E" size={16} weight={600} lineHeight={24}>Message page states (same layout; badge icon, title, message and actions change)</Text>
  <Frame name="State error" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>error · icon circle-alert danger · primary "Start again" + link "Back to BricoMission"</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Something went wrong — We couldn't complete this step. Please start again. If it keeps happening, try again in a few minutes.</Text>
  </Frame>
  <Frame name="State info" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>info · icon info primary · primary "Back to BricoMission" (no secondary link)</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>Good to know — [Keycloak info message, e.g. "Your email address has been verified."]</Text>
  </Frame>
  <Frame name="State page expired" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>page expired · icon clock warning · primary "Start again" + link "Back to BricoMission"</Text>
    <Text name="Text" w={372} color="#1C1C1E" lineHeight={20}>This page has expired — For your security, this step timed out. Start again to continue.</Text>
  </Frame>
</Frame>