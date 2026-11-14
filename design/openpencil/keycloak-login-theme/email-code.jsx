<Frame name="Email code" x={1880} flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" items="center" py={0} px={16}>
    <Frame name="Logo (wordmark SVG 140x22, see docs/design/brand-logo-animation.md)" w={140} h={22} />
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={32} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="Mail badge" flex="row" w={56} h={56} justify="center" items="center" bg="#E6EEFD" rounded={999}>
        <Icon name="lucide:mail" size={26} color="#2968EC" />
      </Frame>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Check your email</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>We sent a 6-digit code to maria@example.com. Enter it below to continue.</Text>
    </Frame>
    <Frame name="Form" flex="col" w="fill" gap={16}>
      <Frame name="Field Code" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Verification code</Text>
        <Frame name="Input" flex="row" h={56} w="fill" justify="center" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value" color="#182231" size={28} weight={600} lineHeight={34} letterSpacing={8}>482915</Text>
        </Frame>
        <Text name="Hint" w="fill" color="#6B6B70" lineHeight={20}>The code is valid for 5 minutes.</Text>
      </Frame>
      <Frame name="PrimaryButton" flex="row" h={52} w="fill" justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Verify</Text>
      </Frame>
      <Frame name="SecondaryButton Resend" flex="row" h={52} w="fill" justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
        <Text name="Label" color="#2968EC" size={16} weight={600} lineHeight={24}>Resend code</Text>
      </Frame>
    </Frame>
    <Frame name="Links" flex="col" w="fill" items="center">
      <Frame name="Cancel link" flex="row" h={44} items="center">
        <Text name="Text" color="#2968EC" weight="medium" lineHeight={20} textDecoration="underline">Cancel and go back</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>