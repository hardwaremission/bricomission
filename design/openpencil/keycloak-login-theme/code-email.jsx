<Frame name="Code email (HTML, 600 wide)" y={1100} flex="col" w={600} p={24} bg="#FAFAF8">
  <Frame name="Card" flex="col" w="fill" gap={24} p={32} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
    <Text name="Wordmark" color="#1F4E79" size={22} weight="bold" lineHeight={28}>BricoMission</Text>
    <Frame name="Body" flex="col" w="fill" gap={12}>
      <Text name="Greeting" w="fill" color="#1C1C1E" size={16} lineHeight={24}>Hi María,</Text>
      <Text name="Intro" w="fill" color="#1C1C1E" size={16} lineHeight={24}>Use this code to confirm it's you and continue in BricoMission:</Text>
    </Frame>
    <Frame name="Code box" flex="row" h={72} w="fill" justify="center" items="center" bg="#F2F1ED" rounded={12}>
      <Text name="Code" color="#1F4E79" size={34} weight="bold" lineHeight={40} letterSpacing={10}>482915</Text>
    </Frame>
    <Text name="Validity" w="fill" color="#6B6B70" lineHeight={20}>The code is valid for 5 minutes.</Text>
    <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
    <Text name="Ignore line" w="fill" color="#6B6B70" lineHeight={20}>If you didn't try to sign in or create an account, you can ignore this email. Your account stays safe.</Text>
  </Frame>
  <Frame name="Meta" flex="col" w="fill" gap={4} pt={16}>
    <Text name="Subject" w="fill" color="#6B6B70" size={12} lineHeight={16}>Subject: Your BricoMission code: 482915</Text>
    <Text name="Plain text note" w="fill" color="#6B6B70" size={12} lineHeight={16}>Plain-text version: same copy, code on its own line. No remote images; token colors only.</Text>
  </Frame>
</Frame>