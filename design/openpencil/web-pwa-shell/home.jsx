<Frame name="Home" flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Text name="Wordmark" color="#1F4E79" size={22} weight="bold" lineHeight={28}>BricoMission</Text>
    <Frame name="LanguageSelector (closed)" flex="row" h={44} gap={6} items="center" py={0} px={14} bg="#F2F1ED" rounded={999}>
      <Frame name="Globe icon slot" w={18} h={18}>
        <Icon name="lucide:globe" size={18} color="#1C1C1E" />
      </Frame>
      <Text name="Current language" color="#1C1C1E" weight={600} lineHeight={20}>English</Text>
      <Frame name="Chevron icon slot" w={16} h={16}>
        <Icon name="lucide:chevron-down" size={16} color="#1C1C1E" />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={16} pr={16} pb={24} pl={16}>
    <Frame name="Hero" flex="col" w="fill" gap={12}>
      <Text name="Headline" w="fill" color="#1C1C1E" size={34} weight="bold" lineHeight={39}>Design your new kitchen and know its price before you start.</Text>
      <Text name="Value proposition" w="fill" color="#6B6B70" size={16} lineHeight={24}>Upload photos and measurements of your kitchen. See photorealistic designs, get a budget priced from real store catalogs, then do it yourself or receive offers from validated professionals.</Text>
    </Frame>
    <Frame name="Steps" flex="col" w="fill" gap={12}>
      <Frame name="Step 1 Capture" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 1" flex="row" w={44} h={44} justify="center" items="center" bg="#E8DCC8" rounded={999}>
          <Icon name="lucide:camera" size={22} color="#1F4E79" />
        </Frame>
        <Frame name="Step text 1" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#1C1C1E" size={16} weight={600} lineHeight={24}>1. Capture</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Photos of your kitchen and its measurements.</Text>
        </Frame>
      </Frame>
      <Frame name="Step 2 Design" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 2" flex="row" w={44} h={44} justify="center" items="center" bg="#E8DCC8" rounded={999}>
          <Icon name="lucide:sparkles" size={22} color="#1F4E79" />
        </Frame>
        <Frame name="Step text 2" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#1C1C1E" size={16} weight={600} lineHeight={24}>2. Design</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Photorealistic designs that keep your room's layout.</Text>
        </Frame>
      </Frame>
      <Frame name="Step 3 Budget" flex="row" w="fill" gap={16} items="center" p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
        <Frame name="Step icon 3" flex="row" w={44} h={44} justify="center" items="center" bg="#E8DCC8" rounded={999}>
          <Icon name="lucide:receipt-text" size={22} color="#1F4E79" />
        </Frame>
        <Frame name="Step text 3" flex="col" grow={1} gap={2}>
          <Text name="Text" w="fill" color="#1C1C1E" size={16} weight={600} lineHeight={24}>3. Budget</Text>
          <Text name="Text" w="fill" color="#6B6B70" lineHeight={20}>Four price levels from real catalogs. Do it yourself or get offers.</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="ProfessionalLink" flex="row" h={44} w="fill" justify="center" items="center">
      <Text name="Professional link label" color="#1F4E79" weight="medium" lineHeight={20} textDecoration="underline">Are you a professional?</Text>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="ServiceStatus" flex="row" w="fill" gap={8} justify="center" items="center">
      <Ellipse name="Status dot" w={8} h={8} bg="#2E7D4F" />
      <Text name="Status label" color="#6B6B70" lineHeight={20}>Service available</Text>
    </Frame>
    <Frame name="PrimaryCTA" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#1F4E79" rounded={999}>
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Start your Kitchen Project</Text>
      <Icon name="lucide:arrow-right" size={20} color="#FFFFFF" />
    </Frame>
  </Frame>
</Frame>