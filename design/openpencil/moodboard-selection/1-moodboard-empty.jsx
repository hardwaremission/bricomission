<Frame name="1 · Moodboard – empty (full length)" x={-430} flex="col" w={390} bg="#FAFAF8">
  <Frame name="Header" flex="row" h={64} w="fill" justify="between" items="center" py={0} px={16}>
    <Frame name="Back button – accessible name 'Back to your kitchen'" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
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
        <Text name="Step label" color="#6B6B70" weight={600} lineHeight={20}>Step 2 of 2</Text>
        <Frame name="Step bar" flex="row" h={4} w="fill" gap={4}>
          <Frame name="Segment done" w={177} h={4} grow={1} bg="#2968EC" rounded={999} />
          <Frame name="Segment current" w={177} h={4} grow={1} bg="#2968EC" rounded={999} />
        </Frame>
      </Frame>
      <Text name="Title" w="fill" color="#182231" size={28} weight="bold" lineHeight={34}>Your style</Text>
      <Text name="Helper" w="fill" color="#6B6B70" size={16} lineHeight={24}>Pick kitchens you like and add your own references. We'll use them to design your new kitchen.</Text>
    </Frame>
    <Frame name="Section Moodboard" flex="col" w="fill" gap={12}>
      <Frame name="Section header" flex="row" w="fill" justify="between" items="center">
        <Text name="Section title" color="#182231" size={18} weight={600} lineHeight={24}>Your moodboard</Text>
        <Text name="Counter (aria-live=polite)" color="#6B6B70" weight={600} lineHeight={20}>0 of 12</Text>
      </Frame>
      <Text name="Upload rules" w="fill" color="#6B6B70" lineHeight={20}>Your photos: JPG, PNG, WebP or HEIC · up to 15 MB</Text>
      <Frame name="MoodboardGrid (2 columns, gap 16 both axes)" flex="col" w="fill" gap={16}>
        <Frame name="Grid row 1" flex="row" w="fill" gap={16}>
          <Frame name="AddReferenceTile – button 'Add your photos'" flex="col" h={128} grow={1} gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
            <Icon name="lucide:image-plus" size={24} color="#2968EC" />
            <Text name="Text" color="#2968EC" weight={600} lineHeight={20}>Add your photos</Text>
          </Frame>
          <Frame name="Spacer (empty second column)" w={171} h={128} grow={1} />
        </Frame>
        <Text name="Empty hint" w="fill" color="#6B6B70" lineHeight={20}>Nothing here yet. Pick kitchens from the gallery or add your own photos.</Text>
      </Frame>
    </Frame>
    <Frame name="Section Style gallery" flex="col" w="fill" gap={12}>
      <Frame name="Section header" flex="col" w="fill" gap={4}>
        <Text name="Section title" color="#182231" size={18} weight={600} lineHeight={24}>Style gallery</Text>
        <Text name="Gallery helper" w="fill" color="#6B6B70" lineHeight={20}>Tap a kitchen to add it to your moodboard. Tap again to remove it.</Text>
      </Frame>
      <Frame name="StyleFilter (radiogroup, scrolls horizontally, bleeds to the screen edge)" flex="row" w="fill" gap={8} overflow="hidden">
        <Frame name="Chip All (selected)" flex="row" h={44} items="center" py={0} px={16} bg="#2968EC" rounded={999}>
          <Text name="Text" color="#FFFFFF" weight={600} lineHeight={20}>All</Text>
        </Frame>
        <Frame name="Chip Modern" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
          <Text name="Text" color="#182231" weight={600} lineHeight={20}>Modern</Text>
        </Frame>
        <Frame name="Chip Scandinavian" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
          <Text name="Text" color="#182231" weight={600} lineHeight={20}>Scandinavian</Text>
        </Frame>
        <Frame name="Chip Industrial" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
          <Text name="Text" color="#182231" weight={600} lineHeight={20}>Industrial</Text>
        </Frame>
        <Frame name="Chip Farmhouse" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
          <Text name="Text" color="#182231" weight={600} lineHeight={20}>Farmhouse</Text>
        </Frame>
      </Frame>
      <Frame name="GalleryGrid (2 columns, gap 16 both axes; first 6 of 24 shown)" flex="col" w="fill" gap={16}>
        <Frame name="Grid row 1" flex="row" w="fill" gap={16}>
          <Frame name="GalleryTile Modern 1 – toggle 'Modern kitchen 1', aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Modern</Text>
            </Frame>
          </Frame>
          <Frame name="GalleryTile Modern 2 – toggle 'Modern kitchen 2', aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "d843123bf01b601f07dd908338646797764c1569",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Modern</Text>
            </Frame>
          </Frame>
        </Frame>
        <Frame name="Grid row 2" flex="row" w="fill" gap={16}>
          <Frame name="GalleryTile Scandinavian 1 – aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "d843123bf01b601f07dd908338646797764c1569",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Scandinavian</Text>
            </Frame>
          </Frame>
          <Frame name="GalleryTile Scandinavian 2 – aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Scandinavian</Text>
            </Frame>
          </Frame>
        </Frame>
        <Frame name="Grid row 3" flex="row" w="fill" gap={16}>
          <Frame name="GalleryTile Industrial 1 – aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "0e81de5c752dfcecdb4aebdbce9b4263f71e7499",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Industrial</Text>
            </Frame>
          </Frame>
          <Frame name="GalleryTile Industrial 2 – aria-pressed=false" flex="col" h={128} grow={1} justify="between" p={8} fills={[
            {
              type: "IMAGE",
              color: { r: 0, g: 0, b: 0, a: 1 },
              opacity: 1,
              visible: true,
              imageHash: "d843123bf01b601f07dd908338646797764c1569",
              imageScaleMode: "FILL"
            }
          ]} rounded={20}>
            <Frame name="Top row" flex="row" w="fill" justify="end">
              <Frame name="Add badge" flex="row" w={28} h={28} justify="center" items="center" bg="#FFFFFF" rounded={999} shadow="0 1 2 #0000001F">
                <Icon name="lucide:plus" size={16} color="#182231" />
              </Frame>
            </Frame>
            <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
              <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Industrial</Text>
            </Frame>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="BottomActionBar (sticky)" flex="col" w="fill" gap={12} pt={12} pr={16} pb={24} pl={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
    <Text name="Continue hint (aria-describedby of Continue)" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Add at least one kitchen or photo to continue.</Text>
    <Frame name="PrimaryCTA Continue – disabled (aria-disabled)" flex="row" h={52} w="fill" justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Continue</Text>
    </Frame>
  </Frame>
</Frame>