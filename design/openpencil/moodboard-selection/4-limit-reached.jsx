<Frame name="4 · Limit reached (12 of 12)" x={1340} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>Limit reached: 12 items (photos and gallery picks together)</Text>
  <Frame name="Counter row" flex="row" w="fill" justify="between" items="center">
    <Text name="Section title" color="#182231" size={18} weight={600} lineHeight={24}>Your moodboard</Text>
    <Text name="Counter" color="#6B6B70" weight={600} lineHeight={20}>12 of 12</Text>
  </Frame>
  <Frame name="Row" flex="row" w="fill" gap={16}>
    <Frame name="AddReferenceTile – disabled (aria-disabled)" flex="col" h={128} grow={1} gap={8} justify="center" items="center" bg="#F2F1ED" rounded={20}>
      <Icon name="lucide:image-plus" size={24} color="#6B6B70" />
      <Text name="Text" color="#6B6B70" weight={600} lineHeight={20}>Add your photos</Text>
    </Frame>
    <Frame name="GalleryTile unselected – disabled (aria-disabled, not pressable)" flex="col" h={128} grow={1} justify="between" p={8} fills={[
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
        <Frame name="Add badge – disabled" flex="row" w={28} h={28} justify="center" items="center" bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:plus" size={16} color="#6B6B70" />
        </Frame>
      </Frame>
      <Frame name="Style label" flex="row" py={2} px={8} bg="#FFFFFF" rounded={999}>
        <Text name="Text" color="#182231" size={12} weight={600} lineHeight={16}>Industrial</Text>
      </Frame>
    </Frame>
  </Frame>
  <Text name="Limit message (below the moodboard grid)" w="fill" color="#6B6B70" lineHeight={20}>You've added 12 items, the maximum. Remove one to add another.</Text>
  <Text name="Rule" w="fill" color="#6B6B70" size={12} lineHeight={16}>Selected gallery tiles stay pressable (tap removes). Unselected tiles and the add tile are disabled; the same message also shows under the gallery helper.</Text>
</Frame>