<Frame name="Sign-in problem (/auth/error) – generic" x={1410} flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Text name="Wordmark" color="#1F4E79" size={22} weight="bold" lineHeight={28}>BricoMission</Text>
    <Frame name="LanguageSelector (closed)" flex="row" h={44} gap={6} items="center" py={0} px={14} bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:globe" size={18} color="#1C1C1E" />
      <Text name="Text" color="#1C1C1E" weight={600} lineHeight={20}>English</Text>
      <Icon name="lucide:chevron-down" size={16} color="#1C1C1E" />
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={32} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="Badge" flex="row" w={56} h={56} justify="center" items="center" bg="#E8DCC8" rounded={999}>
        <Icon name="lucide:circle-alert" size={26} color="#C0392B" />
      </Frame>
      <Text name="Title" w="fill" color="#1C1C1E" size={28} weight="bold" lineHeight={34}>We couldn't sign you in</Text>
      <Text name="Helper (generic)" w="fill" color="#6B6B70" size={16} lineHeight={24}>Something went wrong while signing you in. Please try again.</Text>
    </Frame>
    <Frame name="Actions" flex="col" w="fill" gap={8} items="center">
      <Frame name="PrimaryButton" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#1F4E79" rounded={999}>
        <Icon name="lucide:rotate-ccw" size={20} color="#FFFFFF" />
        <Text name="Text" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Try again</Text>
      </Frame>
      <Frame name="Back link" flex="row" h={44} gap={6} items="center">
        <Icon name="lucide:arrow-left" size={16} color="#1F4E79" />
        <Text name="Text" color="#1F4E79" weight="medium" lineHeight={20} textDecoration="underline">Back to Home</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>