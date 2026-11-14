<Frame name="7a · Generate @360x780 check (Nederlands)" y={900} flex="col" h={780} w={360} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – accessible name 'Back to your style'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed, compact < 375px)" flex="row" h={44} gap={4} justify="center" items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={16} color="#182231" />
        <Text name="Current language" color="#182231" size={12} weight={600} lineHeight={16}>Nederlands</Text>
        <Icon name="lucide:chevron-down" size={14} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (anonymous)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:user-round" size={20} color="#182231" />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" grow={1} w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="StepIndicator" flex="col" w="fill" gap={8}>
        <Text name="Step label" color="#6B6B70" weight={600} lineHeight={20}>Step 3 of 3</Text>
        <Frame name="Step bar" flex="row" h={4} w="fill" gap={4}>
          <Frame name="Segment 1" w={106.66666412353516} h={4} grow={1} bg="#2968EC" rounded={999} />
          <Frame name="Segment 2" w={106.66666412353516} h={4} grow={1} bg="#2968EC" rounded={999} />
          <Frame name="Segment 3" w={106.66666412353516} h={4} grow={1} bg="#2968EC" rounded={999} />
        </Frame>
      </Frame>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Ready to design</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Check your kitchen and choose what to create. We'll ask you to sign in so your project is saved.</Text>
    </Frame>
    <Frame name="SummaryCard" flex="col" w="fill" gap={16} p={16} bg="#FFFFFF" rounded={20} shadow="0 4 16 #0000000F">
      <Frame name="Kitchen header" flex="row" w="fill" justify="between" items="center">
        <Text name="Title" color="#182231" size={16} weight={600} lineHeight={24}>Your kitchen</Text>
        <Frame name="Edit link → Capture (44 tall)" flex="row" h={44} items="center" py={0} px={8}>
          <Text name="Text" color="#2968EC" weight={600} lineHeight={20} textDecoration="underline">Edit</Text>
        </Frame>
      </Frame>
      <Frame name="Photo strip (first 3 thumbs + more count)" flex="row" w="fill" gap={8}>
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
      <Frame name="Style header" flex="row" w="fill" justify="between" items="center">
        <Text name="Title" color="#182231" size={16} weight={600} lineHeight={24}>Your style</Text>
        <Frame name="Edit link → Moodboard (44 tall)" flex="row" h={44} items="center" py={0} px={8}>
          <Text name="Text" color="#2968EC" weight={600} lineHeight={20} textDecoration="underline">Edit</Text>
        </Frame>
      </Frame>
      <Frame name="Moodboard strip (first 3 thumbs + more count)" flex="row" w="fill" gap={8}>
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
      <Text name="Style count" w="fill" color="#6B6B70" lineHeight={20}>4 items in your moodboard</Text>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA 'Generate my kitchen' (opens Login Gate when anonymous)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Icon name="lucide:sparkles" size={20} color="#FFFFFF" />
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Generate my kitchen</Text>
    </Frame>
    <Frame name="SecondaryCTA 'Get my budget' (opens Login Gate when anonymous)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:receipt-text" size={20} color="#2968EC" />
      <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Get my budget</Text>
    </Frame>
  </Frame>
</Frame>