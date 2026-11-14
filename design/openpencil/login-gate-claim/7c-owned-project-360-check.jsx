<Frame name="7c · Owned project @360x780 check (Nederlands)" x={860} y={900} flex="col" h={780} w={360} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Logo link (wordmark SVG 140x22 in a 140x44 hit area, link to /)" flex="row" w={140} h={44} items="center">
      <Frame name="Logo" w={140} h={22} fills={[solid("#FFFFFF00", { opacity: 1 })]} overflow="hidden">
        <Group name="accent-blue" w={66} h={5}>
          <Vector name="Vector" w={6} h={5} bg="#2968EC" />
          <Vector name="Vector" x={60} w={6} h={5} bg="#2968EC" />
        </Group>
        <Group name="glyphs" w={140} h={22}>
          <Vector name="Vector" x={3} w={14} h={22} bg="#182231" />
          <Vector name="Vector" y={5} w={5} h={16} bg="#182231" />
          <Vector name="Vector" x={20} y={10} w={7} h={12} bg="#182231" />
          <Vector name="Vector" x={28} y={5} w={4} h={4} bg="#182231" />
          <Vector name="Vector" x={28} y={10} w={3} h={11} bg="#182231" />
          <Vector name="Vector" x={33} y={10} w={11} h={12} bg="#182231" />
          <Vector name="Vector" x={46} y={10} w={12} h={12} bg="#182231" />
          <Vector name="Vector" x={59} y={5} w={3} h={16} bg="#182231" />
          <Vector name="Vector" x={63} y={3} w={9} h={13} bg="#182231" />
          <Vector name="Vector" x={71} w={8} h={16} bg="#182231" />
          <Vector name="Vector" x={78} w={3} h={22} bg="#182231" />
          <Vector name="Vector" x={83} y={5} w={4} h={4} bg="#182231" />
          <Vector name="Vector" x={84} y={10} w={3} h={11} bg="#182231" />
          <Vector name="Vector" x={89} y={10} w={10} h={12} bg="#182231" />
          <Vector name="Vector" x={99} y={10} w={10} h={12} bg="#182231" />
          <Vector name="Vector" x={110} y={5} w={4} h={4} bg="#182231" />
          <Vector name="Vector" x={111} y={10} w={3} h={11} bg="#182231" />
          <Vector name="Vector" x={116} y={10} w={12} h={12} bg="#182231" />
          <Vector name="Vector" x={129} y={10} w={11} h={12} bg="#182231" />
        </Group>
      </Frame>
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed, compact < 375px)" flex="row" h={44} gap={4} justify="center" items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={16} color="#182231" />
        <Text name="Current language" color="#182231" size={12} weight={600} lineHeight={16}>Nederlands</Text>
        <Icon name="lucide:chevron-down" size={14} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (signed in) – 'Account: Maria'" flex="row" w={44} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
        <Text name="Initial" color="#FFFFFF" size={16} weight={600} lineHeight={24}>M</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Alert success (role=status, only with ?claimed=1, dismissible)" flex="row" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#2E7D4F" rounded={12}>
      <Icon name="lucide:circle-check" size={20} color="#2E7D4F" />
      <Text name="Text" grow={1} color="#182231" lineHeight={20}>Your kitchen is saved to your account.</Text>
    </Frame>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your kitchen project</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Designs and budgets are coming soon. Your project stays here, ready for them.</Text>
    </Frame>
    <Frame name="SummaryCard (read-only, no Edit links)" flex="col" w="fill" gap={16} p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
      <Text name="Kitchen title" color="#182231" size={16} weight={600} lineHeight={24}>Your kitchen</Text>
      <Frame name="Photo strip" flex="row" w="fill" gap={8}>
        <Frame name="Thumb 1" w={93.33333587646484} h={60} grow={1} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
        <Frame name="Thumb 2" w={93.33333587646484} h={60} grow={1} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "d843123bf01b601f07dd908338646797764c1569",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
        <Frame name="More count" flex="row" h={60} grow={1} justify="center" items="center" bg="#F2F1ED" rounded={12}>
          <Text name="Text" color="#6B6B70" weight={600} lineHeight={20}>+1</Text>
        </Frame>
      </Frame>
      <Frame name="Measurements row" flex="row" w="fill" gap={8} items="center">
        <Icon name="lucide:ruler" size={16} color="#6B6B70" />
        <Text name="Text" grow={1} color="#182231" lineHeight={20}>4.20 × 3.10 m · height 2.60 m</Text>
      </Frame>
      <Frame name="Divider" w="fill" h={1} bg="#E2E0DA" />
      <Text name="Style title" color="#182231" size={16} weight={600} lineHeight={24}>Your style</Text>
      <Frame name="Moodboard strip" flex="row" w="fill" gap={8}>
        <Frame name="Thumb 1" w={93.33333587646484} h={60} grow={1} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "d843123bf01b601f07dd908338646797764c1569",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
        <Frame name="Thumb 2" w={93.33333587646484} h={60} grow={1} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
        <Frame name="More count" flex="row" h={60} grow={1} justify="center" items="center" bg="#F2F1ED" rounded={12}>
          <Text name="Text" color="#6B6B70" weight={600} lineHeight={20}>+2</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="Link 'Start a new kitchen project' → /kitchen-projects/new (44 tall)" flex="row" h={44} w="fill" gap={6} justify="center" items="center">
      <Icon name="lucide:plus" size={16} color="#2968EC" />
      <Text name="Text" color="#2968EC" weight={600} lineHeight={20} textDecoration="underline">Start a new kitchen project</Text>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Text name="Hint 'Available soon' (aria-describedby of both buttons)" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Available soon</Text>
    <Frame name="Generate my kitchen – disabled (aria-disabled)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:sparkles" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Generate my kitchen</Text>
    </Frame>
    <Frame name="Get my budget – disabled (aria-disabled)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:receipt-text" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Get my budget</Text>
    </Frame>
  </Frame>
</Frame>