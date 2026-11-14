<Frame name="1 · AI Results – render running (first render, auto-started)" x={430} flex="col" h={844} w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – 'Back to my kitchen'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed)" flex="row" h={44} gap={6} items="center" py={0} px={14} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={18} color="#182231" />
        <Text name="Current language" color="#182231" weight={600} lineHeight={20}>English</Text>
        <Icon name="lucide:chevron-down" size={16} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (signed in)" flex="row" w={44} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Initial" color="#FFFFFF" size={16} weight={600} lineHeight={24}>M</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Designing your kitchen</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Scandinavian style, from photo 1. This takes about 10 to 30 seconds.</Text>
    </Frame>
    <Frame name="Render placeholder (aria-busy; before photo dimmed)" flex="col" h={245} w={358} gap={12} justify="center" items="center" fills={[
      {
        type: "IMAGE",
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
        imageScaleMode: "FILL"
      }
    ]} rounded={20}>
      <Frame name="Status card (role=status, aria-live=polite)" flex="col" w={240} gap={12} items="center" p={16} bg="#FFFFFF" rounded={16} shadow="0 4 16 #0000000F">
        <Icon name="lucide:loader" size={24} color="#2968EC" />
        <Text name="Status" w="fill" color="#182231" size={16} weight={600} textAlign="center" lineHeight={24}>Generating…</Text>
        <Frame name="Indeterminate bar" flex="row" h={6} w="fill" bg="#E2E0DA" rounded={999}>
          <Frame name="Moving segment" w={80} h={6} bg="#2968EC" rounded={999} />
        </Frame>
      </Frame>
    </Frame>
    <Text name="Note" w="fill" color="#6B6B70" lineHeight={20}>You can leave this page; the render keeps going and appears here when it's ready.</Text>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Text name="Hint (one active render per project)" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>One render at a time.</Text>
    <Frame name="Generate again – disabled while queued/running" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Generate again</Text>
    </Frame>
  </Frame>
</Frame>