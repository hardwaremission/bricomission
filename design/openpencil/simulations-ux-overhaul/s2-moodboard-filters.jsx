<Frame name="S2 · Moodboard – Style Gallery filters as a wrapping tag cloud (390 and 360 wide, replaces the horizontal scroll row)" y={1500} flex="row" gap={24} p={16} bg="#FAFAF8">
  <Frame name="390 wide" flex="col" w={358} gap={12}>
    <Text name="Annotation" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>NORMATIVE: chips wrap onto as many rows as needed (no horizontal scroll, nothing hidden); row gap 8, column gap 8; each chip 44 high, padding 16, pill; selected = primary fill, white 14/20 semibold plus a 14 px check icon (never colour alone); others surfaceMuted with text colour. Multi-select stays: any number of styles can be active, and All clears them. Chip order unchanged.</Text>
    <Frame name="Filter chips (wrap, row gap 8)" flex="row" w="fill" gap={8} wrap rowGap={8}>
      <Frame name="Chip All selected" flex="row" h={44} gap={6} items="center" py={0} px={16} bg="#2968EC" rounded={999}>
        <Icon name="lucide:check" size={14} color="#FFFFFF" />
        <Text name="Label" color="#FFFFFF" weight={600} lineHeight={20}>All</Text>
      </Frame>
      <Frame name="Chip Scandinavian" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Scandinavian</Text>
      </Frame>
      <Frame name="Chip Industrial" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Industrial</Text>
      </Frame>
      <Frame name="Chip Mediterranean" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Mediterranean</Text>
      </Frame>
      <Frame name="Chip Minimalist" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Minimalist</Text>
      </Frame>
      <Frame name="Chip Rustic" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Rustic</Text>
      </Frame>
      <Frame name="Chip Classic" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Classic</Text>
      </Frame>
      <Frame name="Chip Japandi" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Japandi</Text>
      </Frame>
      <Frame name="Chip Modern farmhouse" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Modern farmhouse</Text>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="360 wide check (long labels, German)" flex="col" w={328} gap={12}>
    <Text name="Annotation 360" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>CHECK 360 (de): a long label is never cut; it moves to the next row; two selected chips shown.</Text>
    <Frame name="Filter chips 360" flex="row" w="fill" gap={8} wrap rowGap={8}>
      <Frame name="Chip Alle" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Alle</Text>
      </Frame>
      <Frame name="Chip Skandinavisch selected" flex="row" h={44} gap={6} items="center" py={0} px={16} bg="#2968EC" rounded={999}>
        <Icon name="lucide:check" size={14} color="#FFFFFF" />
        <Text name="Label" color="#FFFFFF" weight={600} lineHeight={20}>Skandinavisch</Text>
      </Frame>
      <Frame name="Chip Mediterran selected" flex="row" h={44} gap={6} items="center" py={0} px={16} bg="#2968EC" rounded={999}>
        <Icon name="lucide:check" size={14} color="#FFFFFF" />
        <Text name="Label" color="#FFFFFF" weight={600} lineHeight={20}>Mediterran</Text>
      </Frame>
      <Frame name="Chip Landhausstil modern" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Moderner Landhausstil</Text>
      </Frame>
      <Frame name="Chip Industriell" flex="row" h={44} items="center" py={0} px={16} bg="#F2F1ED" rounded={999}>
        <Text name="Label" color="#182231" weight={600} lineHeight={20}>Industriell</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>