<Frame name="2 · AI Results – render succeeded (/kitchen-projects/<id>/results)" flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – 'Back to my kitchen' (→ /kitchen-projects/<id>)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
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
  <Frame name="Content" flex="col" w="fill" gap={24} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={8}>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your new kitchen</Text>
      <Text name="Helper (style + photo)" w="fill" color="#6B6B70" size={16} lineHeight={24}>Scandinavian style, from photo 1. Drag the handle to compare.</Text>
    </Frame>
    <Frame name="BeforeAfterSlider (role=slider, aria-valuenow 50, keyboard ← →; aspect = render bucket, e.g. 1216:832)" w={358} h={245} fills={[
      {
        type: "IMAGE",
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 1,
        visible: true,
        imageHash: "d843123bf01b601f07dd908338646797764c1569",
        imageScaleMode: "FILL"
      }
    ]} rounded={20}>
      <Frame name="Before layer (clipped to the handle position)" w={179} h={245} fills={[
        {
          type: "IMAGE",
          color: { r: 0, g: 0, b: 0, a: 1 },
          opacity: 1,
          visible: true,
          imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
          imageScaleMode: "FILL"
        }
      ]} />
      <Frame name="Divider line" x={178} w={2} h={245} bg="#FFFFFF" />
      <Frame name="Handle (44 hit area, visual 40)" x={159} y={100} flex="row" w={40} h={40} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
        <Icon name="lucide:chevrons-left-right" size={20} color="#182231" />
      </Frame>
      <Frame name="Label Before" x={12} y={12} flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Before</Text>
      </Frame>
      <Frame name="Label After" x={300} y={12} flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>After</Text>
      </Frame>
    </Frame>
    <Frame name="Section Photo picker (radiogroup; shown with 2+ photos)" flex="col" w="fill" gap={12}>
      <Frame name="Header" flex="col" w="fill" gap={4}>
        <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Photo for the next render</Text>
        <Text name="Helper" w="fill" color="#6B6B70" lineHeight={20}>The render keeps the walls, windows and plumbing of this photo.</Text>
      </Frame>
      <Frame name="Photo options (row gap 12; 4:3 thumbs 96x72, radius 12)" flex="row" w="fill" gap={12}>
        <Frame name="Photo 1 – selected (aria-checked)" flex="row" w={96} h={72} justify="end" p={4} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
            imageScaleMode: "FILL"
          }
        ]} stroke="#2968EC" strokeWidth={3} rounded={12}>
          <Frame name="Selected badge" flex="row" w={24} h={24} justify="center" items="center" bg="#2968EC" rounded={999}>
            <Icon name="lucide:check" size={14} color="#FFFFFF" />
          </Frame>
        </Frame>
        <Frame name="Photo 2" w={96} h={72} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "d843123bf01b601f07dd908338646797764c1569",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
        <Frame name="Photo 3" w={96} h={72} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
      </Frame>
    </Frame>
    <Frame name="Section History" flex="col" w="fill" gap={12}>
      <Frame name="Header" flex="row" w="fill" justify="between" items="center">
        <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Your renders</Text>
        <Text name="Counter" color="#6B6B70" weight={600} lineHeight={20}>2 of 10</Text>
      </Frame>
      <Frame name="History strip (newest first; tap shows it in the slider; scrolls horizontally)" flex="row" w="fill" gap={12}>
        <Frame name="Render 2 – shown (aria-current)" w={110} h={75} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "d843123bf01b601f07dd908338646797764c1569",
            imageScaleMode: "FILL"
          }
        ]} stroke="#2968EC" strokeWidth={3} rounded={12} />
        <Frame name="Render 1" w={110} h={75} fills={[
          {
            type: "IMAGE",
            color: { r: 0, g: 0, b: 0, a: 1 },
            opacity: 1,
            visible: true,
            imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
            imageScaleMode: "FILL"
          }
        ]} rounded={12} />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="PrimaryCTA 'Generate again' (new seed, selected photo)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Icon name="lucide:refresh-cw" size={20} color="#FFFFFF" />
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Generate again</Text>
    </Frame>
    <Frame name="SecondaryCTA 'Back to my kitchen'" flex="row" h={52} w="fill" justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Back to my kitchen</Text>
    </Frame>
  </Frame>
</Frame>