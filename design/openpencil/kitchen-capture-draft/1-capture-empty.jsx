<Frame name="1 · Capture – empty (full length)" flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – accessible name 'Back to Home'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
      <Icon name="lucide:arrow-left" size={20} color="#182231" />
    </Frame>
    <Frame name="HeaderActions" flex="row" gap={8} items="center">
      <Frame name="LanguageSelector (closed)" flex="row" h={44} gap={6} items="center" py={0} px={14} bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:globe" size={18} color="#182231" />
        <Text name="Current language" color="#182231" weight={600} lineHeight={20}>English</Text>
        <Icon name="lucide:chevron-down" size={16} color="#182231" />
      </Frame>
      <Frame name="AccountEntry (anonymous)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:user-round" size={20} color="#182231" />
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Content" flex="col" w="fill" gap={32} pt={8} pr={16} pb={24} pl={16}>
    <Frame name="Intro" flex="col" w="fill" gap={12}>
      <Frame name="StepIndicator" flex="col" w="fill" gap={8}>
        <Text name="Step label" color="#6B6B70" weight={600} lineHeight={20}>Step 1 of 2</Text>
        <Frame name="Step bar" flex="row" h={4} w="fill" gap={4}>
          <Frame name="Segment done" w={177} h={4} grow={1} bg="#2968EC" rounded={999} />
          <Frame name="Segment todo" w={177} h={4} grow={1} bg="#E2E0DA" rounded={999} />
        </Frame>
      </Frame>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your kitchen</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Add photos and the measurements of the room you want to renovate.</Text>
    </Frame>
    <Frame name="Section Photos" flex="col" w="fill" gap={12}>
      <Frame name="Section header" flex="col" w="fill" gap={4}>
        <Text name="Section title" color="#182231" size={18} weight={600} lineHeight={24}>Photos</Text>
        <Text name="Photo rules" w="fill" color="#6B6B70" lineHeight={20}>JPG, PNG, WebP or HEIC · up to 15 MB · up to 8 photos</Text>
      </Frame>
      <Frame name="PhotoGrid (2 columns, gap 16 both axes)" flex="col" w="fill" gap={16} wrap>
        <Frame name="Grid row 1" flex="row" grow={1} gap={16}>
          <Frame name="AddPhotoTile – button 'Add photos'" flex="col" h={128} w={171} gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
            <Icon name="lucide:image-plus" size={24} color="#2968EC" />
            <Text name="Text" color="#2968EC" weight={600} lineHeight={20}>Add photos</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame name="Tip" flex="row" w="fill" gap={8}>
        <Icon name="lucide:lightbulb" size={16} color="#6B6B70" />
        <Text name="Text" grow={1} color="#6B6B70" lineHeight={20}>Shoot from the corners so the whole room is visible.</Text>
      </Frame>
    </Frame>
    <Frame name="Section Measurements" flex="col" w="fill" gap={12}>
      <Frame name="Section header" flex="row" w="fill" justify="between" items="center">
        <Text name="Section title" color="#182231" size={18} weight={600} lineHeight={24}>Measurements</Text>
        <Frame name="UnitToggle (segmented, m selected)" flex="row" bg="#F2F1ED" rounded={999}>
          <Frame name="Unit m (selected)" flex="row" w={48} h={44} justify="center" items="center" bg="#2968EC" rounded={999}>
            <Text name="Text" color="#FFFFFF" weight={600} lineHeight={20}>m</Text>
          </Frame>
          <Frame name="Unit cm" flex="row" w={48} h={44} justify="center" items="center" rounded={999}>
            <Text name="Text" color="#182231" weight={600} lineHeight={20}>cm</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame name="Fields row (3 columns, gap 12)" flex="row" w="fill" gap={12}>
        <Frame name="Field Length" flex="col" grow={1} gap={8}>
          <Text name="Label" color="#182231" weight={600} lineHeight={20}>Length</Text>
          <Frame name="Input" flex="row" h={52} w="fill" justify="between" items="center" py={0} px={12} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
            <Text name="Placeholder" color="#6B6B70" size={16} lineHeight={24}>0.00</Text>
            <Text name="Unit suffix" color="#6B6B70" lineHeight={20}>m</Text>
          </Frame>
        </Frame>
        <Frame name="Field Width" flex="col" grow={1} gap={8}>
          <Text name="Label" color="#182231" weight={600} lineHeight={20}>Width</Text>
          <Frame name="Input" flex="row" h={52} w="fill" justify="between" items="center" py={0} px={12} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
            <Text name="Value" color="#6B6B70" size={16} lineHeight={24}>0.00</Text>
            <Text name="Unit suffix" color="#6B6B70" lineHeight={20}>m</Text>
          </Frame>
        </Frame>
        <Frame name="Field Height" flex="col" grow={1} gap={8}>
          <Text name="Label" color="#182231" weight={600} lineHeight={20}>Height</Text>
          <Frame name="Input" flex="row" h={52} w="fill" justify="between" items="center" py={0} px={12} bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
            <Text name="Value" color="#6B6B70" size={16} lineHeight={24}>0.00</Text>
            <Text name="Unit suffix" color="#6B6B70" lineHeight={20}>m</Text>
          </Frame>
        </Frame>
      </Frame>
      <Text name="Range hint" w="fill" color="#6B6B70" lineHeight={20}>Length and width between 1.00 and 20.00 m · height between 1.80 and 6.00 m</Text>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Frame name="Continue hint (what is missing)" flex="row" w="fill" gap={6} justify="center" items="center">
      <Text name="Save status label" w={358} color="#6B6B70" textAlign="center" lineHeight={20}>Add at least one photo and all three measurements to continue.</Text>
    </Frame>
    <Frame name="PrimaryCTA Continue (disabled: aria-disabled, describedby hint)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Continue</Text>
    </Frame>
  </Frame>
</Frame>