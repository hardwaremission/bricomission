<Frame name="Account sheet – open" x={940} flex="col" h={844} w={390} justify="end" bg="#1C1C1E66">
  <Frame name="Sheet" flex="col" w="fill" gap={16} pt={8} pr={16} pb={24} pl={16} bg="#FFFFFF" rounded={20} shadow="0 -8 32 #0000001F">
    <Frame name="Sheet header" flex="row" h={52} w="fill" justify="between" items="center">
      <Text name="Sheet title" color="#1C1C1E" size={18} weight={600} lineHeight={24}>Account</Text>
      <Frame name="Close button – accessible name 'Close'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:x" size={20} color="#1C1C1E" />
      </Frame>
    </Frame>
    <Frame name="User block" flex="row" w="fill" gap={16} items="center">
      <Frame name="Avatar initial" flex="row" w={56} h={56} justify="center" items="center" bg="#1F4E79" rounded={999}>
        <Text name="Text" color="#FFFFFF" size={22} weight={600} lineHeight={28}>M</Text>
      </Frame>
      <Frame name="User text" flex="col" grow={1} gap={2}>
        <Text name="Display name" w="fill" color="#1C1C1E" size={18} weight={600} lineHeight={24}>María López</Text>
        <Text name="Username" w="fill" color="#6B6B70" lineHeight={20}>maria.lopez</Text>
      </Frame>
    </Frame>
    <Frame name="SecondaryButton Sign out" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:log-out" size={20} color="#1F4E79" />
      <Text name="Label" color="#1F4E79" size={16} weight={600} lineHeight={24}>Sign out</Text>
    </Frame>
  </Frame>
</Frame>