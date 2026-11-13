<Frame name="Message page – error" x={2850} flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" items="center" py={0} px={16}>
    <Text name="Wordmark" color="#1F4E79" size={22} weight="bold" lineHeight={28}>BricoMission</Text>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={32} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="State badge (error)" flex="row" w={56} h={56} justify="center" items="center" bg="#E8DCC8" rounded={999}>
        <Icon name="lucide:circle-alert" size={26} color="#C0392B" />
      </Frame>
      <Text name="Title" w="fill" color="#1C1C1E" size={28} weight="bold" lineHeight={34}>Something went wrong</Text>
      <Text name="Message" w="fill" color="#6B6B70" size={16} lineHeight={24}>We couldn't complete this step. Please start again. If it keeps happening, try again in a few minutes.</Text>
    </Frame>
    <Frame name="Actions" flex="col" w="fill" gap={8} items="center">
      <Frame name="PrimaryButton" flex="row" h={52} w="fill" justify="center" items="center" bg="#1F4E79" rounded={999}>
        <Text name="Label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Start again</Text>
      </Frame>
      <Frame name="Back link" flex="row" h={44} gap={6} items="center">
        <Frame name="Back icon slot" w={16} h={16}>
          <Icon name="lucide:arrow-left" size={16} color="#1F4E79" />
        </Frame>
        <Text name="Text" color="#1F4E79" weight="medium" lineHeight={20} textDecoration="underline">Back to BricoMission</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>