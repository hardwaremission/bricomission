<Frame name="Home – anonymous @360x780 (check): below 375 px the selector keeps the full language name at 12/16, centered in a compact pill" y={940} flex="col" h={780} w={360} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Logo (wordmark SVG 140x22, see docs/design/brand-logo-animation.md)" w={140} h={22} />
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed, compact < 375px)" flex="row" h={44} gap={4} justify="center" items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={16} color="#182231" />
        <Text name="Current language" color="#182231" size={12} weight={600} lineHeight={16}>Nederlands</Text>
        <Icon name="lucide:chevron-down" size={14} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (anonymous) – accessible name 'Sign in'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:user-round" size={20} color="#182231" />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={16} pr={16} pb={24} pl={16}>
    <Frame name="Hero" flex="col" w="fill" gap={12}>
      <Text name="Headline" w="fill" color="#182231" size={34} weight="bold" lineHeight={39}>Design your new kitchen and know its price before you start.</Text>
      <Text name="Value proposition" w="fill" color="#6B6B70" size={16} lineHeight={24}>Upload photos and measurements of your kitchen. See photorealistic designs, get a budget priced from real store catalogs, then do it yourself or receive offers from validated professionals.</Text>
    </Frame>
    <Frame name="Steps" flex="col" w="fill" gap={12}>
      <Frame name="Step 1 Capture" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 1" flex="row" w={44} h={44} justify="center" items="center" bg="#E6EEFD" rounded={999}>
          <Icon name="lucide:camera" size={22} color="#2968EC" />
        </Frame>
        <Frame name="Step text 1" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>1. Capture</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Photos of your kitchen and its measurements.</Text>
        </Frame>
      </Frame>
      <Frame name="Step 2 Design" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 2" flex="row" w={44} h={44} justify="center" items="center" bg="#E6EEFD" rounded={999}>
          <Icon name="lucide:sparkles" size={22} color="#2968EC" />
        </Frame>
        <Frame name="Step text 2" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>2. Design</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Photorealistic designs that keep your room's layout.</Text>
        </Frame>
      </Frame>
      <Frame name="Step 3 Budget" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 3" flex="row" w={44} h={44} justify="center" items="center" bg="#E6EEFD" rounded={999}>
          <Icon name="lucide:receipt-text" size={22} color="#2968EC" />
        </Frame>
        <Frame name="Step text 3" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>3. Budget</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Four price levels from real catalogs. Do it yourself or get offers.</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="ProfessionalLink" flex="row" h={44} w="fill" justify="center" items="center">
      <Text name="Professional link label" color="#2968EC" weight="medium" lineHeight={20} textDecoration="underline">Are you a professional?</Text>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="ServiceStatus" flex="row" w="fill" gap={8} justify="center" items="center">
      <Ellipse name="Status dot" w={8} h={8} bg="#2E7D4F" />
      <Text name="Status label" color="#6B6B70" lineHeight={20}>Service available</Text>
    </Frame>
    <Frame name="PrimaryCTA" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Start your Kitchen Project</Text>
      <Icon name="lucide:arrow-right" size={20} color="#FFFFFF" />
    </Frame>
  </Frame>
</Frame>