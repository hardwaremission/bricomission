<Frame name="Email code – states" x={2350} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w="fill" color="#1C1C1E" size={16} weight={600} lineHeight={24}>Email code states (alert shown above the form; same component as Sign in)</Text>
  <Frame name="State wrong code" flex="col" w="fill" gap={8}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>wrong code · input stroke danger 2px + alert error</Text>
    <Frame name="Alert error" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={12}>
      <Frame name="Icon slot error" w={20} h={20}>
        <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      </Frame>
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>That code isn't right. Check the email and try again.</Text>
    </Frame>
  </Frame>
  <Frame name="State code expired" flex="col" w="fill" gap={8}>
    <Text name="Text" w={372} h={32} color="#6B6B70" size={12} weight={600} lineHeight={16} textAutoResize="none">code expired · alert warning; "Resend code" becomes the primary button</Text>
    <Frame name="Alert warning" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={12}>
      <Frame name="Icon slot warning" w={20} h={20}>
        <Icon name="lucide:clock" size={20} color="#B7791F" />
      </Frame>
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>This code has expired. Request a new one to continue.</Text>
    </Frame>
  </Frame>
  <Frame name="State too many attempts" flex="col" w="fill" gap={8}>
    <Text name="Text" w={372} h={32} color="#6B6B70" size={12} weight={600} lineHeight={16} textAutoResize="none">too many attempts (5) · alert error; code field and Verify disabled; "Resend code" primary</Text>
    <Frame name="Alert error" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#C0392B" rounded={12}>
      <Frame name="Icon slot error 2" w={20} h={20}>
        <Icon name="lucide:circle-alert" size={20} color="#C0392B" />
      </Frame>
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>Too many incorrect attempts. Request a new code to continue.</Text>
    </Frame>
  </Frame>
  <Frame name="State resend cooldown" flex="col" w="fill" gap={8}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>resend cooldown · alert info</Text>
    <Frame name="Alert info" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#1F4E79" rounded={12}>
      <Frame name="Icon slot info" w={20} h={20}>
        <Icon name="lucide:info" size={20} color="#1F4E79" />
      </Frame>
      <Text name="Text" grow={1} color="#1C1C1E" lineHeight={20}>Please wait 30 seconds before requesting a new code.</Text>
    </Frame>
  </Frame>
  <Frame name="Resend as primary" flex="col" w="fill" gap={8}>
    <Text name="Text" color="#6B6B70" size={12} weight={600} lineHeight={16}>buttons when the code is expired or attempts are exhausted</Text>
    <Frame name="Frame" flex="row" h={52} w="fill" justify="center" items="center" bg="#1F4E79" rounded={999}>
      <Text name="Text" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Resend code</Text>
    </Frame>
  </Frame>
</Frame>