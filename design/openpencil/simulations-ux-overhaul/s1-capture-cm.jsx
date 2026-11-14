<Frame name="S1 · Capture – measurements default to cm (change to the Measurements section; the rest of the page is unchanged)" y={1200} flex="col" w={390} gap={16} p={16} bg="#FAFAF8">
  <Text name="Annotation" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>NORMATIVE: the unit toggle starts on cm for every new draft (stored values stay metric internally; the toggle cm / m is kept and the choice is remembered per draft). Keypad digits, separator and limits follow the cm rules already approved (whole numbers up to 4 digits, no separator in cm). Placeholder values in the empty fields read as cm hints (for example 400).</Text>
  <Frame name="Section Measurements" flex="col" w="fill" gap={12}>
    <Frame name="Header" flex="row" w="fill" justify="between" items="center">
      <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Measurements</Text>
      <Frame name="Unit toggle (cm selected)" flex="row" gap={4} p={4} bg="#F2F1ED" rounded={16}>
        <Frame name="cm option selected" flex="row" w={48} h={44} justify="center" items="center" bg="#2968EC" rounded={12}>
          <Text name="Label" color="#FFFFFF" weight={600} lineHeight={20}>cm</Text>
        </Frame>
        <Frame name="m option" flex="row" w={48} h={44} justify="center" items="center" rounded={12}>
          <Text name="Label" color="#182231" weight={600} lineHeight={20}>m</Text>
        </Frame>
      </Frame>
    </Frame>
    <Frame name="Fields (3 columns, gap 12)" flex="row" w="fill" gap={12}>
      <Frame name="Field Length" flex="col" grow={1} gap={4} p={12} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
        <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>Length</Text>
        <Text name="Value" color="#182231" size={16} weight={600} lineHeight={24}>420 cm</Text>
      </Frame>
      <Frame name="Field Width" flex="col" grow={1} gap={4} p={12} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
        <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>Width</Text>
        <Text name="Value" color="#182231" size={16} weight={600} lineHeight={24}>310 cm</Text>
      </Frame>
      <Frame name="Field Height" flex="col" grow={1} gap={4} p={12} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
        <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>Height</Text>
        <Text name="Value" color="#182231" size={16} weight={600} lineHeight={24}>250 cm</Text>
      </Frame>
    </Frame>
    <Text name="Empty field hint" w="fill" color="#6B6B70" lineHeight={20}>Empty state: each field shows its placeholder in cm, for example 400 cm.</Text>
  </Frame>
</Frame>