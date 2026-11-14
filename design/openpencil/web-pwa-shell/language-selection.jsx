<Frame name="Language Selection" x={1380} flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" items="center" py={0} px={16}>
    <Frame name="Logo (wordmark SVG 140x22, see docs/design/brand-logo-animation.md)" w={140} h={22} />
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={40} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="Globe badge" flex="row" w={56} h={56} justify="center" items="center" bg="#E6EEFD" rounded={999}>
        <Icon name="lucide:globe" size={26} color="#2968EC" />
      </Frame>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Choose your language</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>We couldn't match your device language. You can change it later from any screen.</Text>
    </Frame>
    <Frame name="LanguageField" flex="col" w="fill" gap={8}>
      <Text name="Field label" color="#182231" weight={600} lineHeight={20}>Language</Text>
      <Frame name="LanguageDropdown (closed)" flex="row" h={52} w="fill" justify="between" items="center" py={0} px={16} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
        <Text name="Selected language" color="#182231" size={16} lineHeight={24}>English</Text>
        <Frame name="Chevron icon slot" w={20} h={20}>
          <Icon name="lucide:chevron-down" size={20} color="#182231" />
        </Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar" flex="col" w="fill" pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA" flex="row" h={52} w="fill" justify="center" items="center" bg="#2968EC" rounded={999}>
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Continue</Text>
    </Frame>
  </Frame>
</Frame>