<Frame name="Create account (full length, scrolls)" x={940} flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" items="center" py={0} px={16}>
    <Frame name="Logo (wordmark SVG 140x22, see docs/design/brand-logo-animation.md)" w={140} h={22} />
  </Frame>
  <Frame name="Content" flex="col" w="fill" gap={24} py={32} px={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Create account</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>It's free. We'll send a code to your email to confirm it's you.</Text>
    </Frame>
    <Frame name="Form" flex="col" w="fill" gap={16}>
      <Frame name="Field First name" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>First name</Text>
        <Frame name="Input" flex="row" h={52} w="fill" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value" color="#182231" size={16} lineHeight={24}>María</Text>
        </Frame>
      </Frame>
      <Frame name="Field Last name" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Last name</Text>
        <Frame name="Input" flex="row" h={52} w="fill" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value" color="#182231" size={16} lineHeight={24}>López</Text>
        </Frame>
      </Frame>
      <Frame name="Field Email" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Email</Text>
        <Frame name="Input" flex="row" h={52} w="fill" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value" color="#182231" size={16} lineHeight={24}>maria@example.com</Text>
        </Frame>
      </Frame>
      <Frame name="Field Username" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Username</Text>
        <Frame name="Input" flex="row" h={52} w="fill" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value" color="#182231" size={16} lineHeight={24}>maria.lopez</Text>
        </Frame>
      </Frame>
      <Frame name="Field Password" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Password</Text>
        <Frame name="Input" flex="row" h={52} w="fill" justify="between" items="center" pr={4} pl={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value (masked)" color="#182231" size={16} lineHeight={24}>••••••••••</Text>
          <Frame name="Show password toggle" flex="row" w={44} h={44} justify="center" items="center" rounded={999}>
            <Icon name="lucide:eye" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
      </Frame>
      <Frame name="Field Confirm password" flex="col" w="fill" gap={8}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Confirm password</Text>
        <Frame name="Input" flex="row" h={52} w="fill" justify="between" items="center" pr={4} pl={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Value (masked)" color="#182231" size={16} lineHeight={24}>••••••••••</Text>
          <Frame name="Show password toggle" flex="row" w={44} h={44} justify="center" items="center" rounded={999}>
            <Icon name="lucide:eye" size={20} color="#6B6B70" />
          </Frame>
        </Frame>
      </Frame>
      <Frame name="PrimaryButton" flex="row" h={52} w="fill" justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Create account</Text>
      </Frame>
    </Frame>
    <Frame name="Links" flex="col" w="fill" items="center">
      <Frame name="Sign in link row" flex="row" h={44} gap={4} items="center">
        <Text name="Text" color="#6B6B70" lineHeight={20}>Already have an account?</Text>
        <Text name="Sign in link" color="#2968EC" weight="medium" lineHeight={20} textDecoration="underline">Sign in</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>