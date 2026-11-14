<Frame name="3 · Measurement keypad – open on Length (bottom sheet)" x={940} flex="col" h={844} w={390} justify="end" bg="#1C1C1E66">
  <Frame name="Sheet (dialog, aria-label 'Enter measurements')" flex="col" w="fill" gap={16} pt={8} pr={16} pb={24} pl={16} bg="#FFFFFF" rounded={20} shadow="0 -8 32 #0000001F">
    <Frame name="Sheet header" flex="row" h={52} w="fill" justify="between" items="center">
      <Text name="Sheet title" color="#1C1C1E" size={18} weight={600} lineHeight={24}>Measurements</Text>
      <Frame name="Close button – 'Close' (keeps entered values)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:x" size={20} color="#1C1C1E" />
      </Frame>
    </Frame>
    <Frame name="Field tabs (tablist: Length / Width / Height, each shows its current value)" flex="row" w="fill" gap={4} p={4} bg="#F2F1ED" rounded={16}>
      <Frame name="Tab Length (selected)" flex="col" h={52} grow={1} justify="center" items="center" bg="#FFFFFF" rounded={12} shadow="0 1 2 #0000001F">
        <Text name="Text" color="#1C1C1E" weight={600} lineHeight={20}>Length</Text>
        <Text name="Text" color="#1F4E79" size={12} weight={600} lineHeight={16}>4.2 m</Text>
      </Frame>
      <Frame name="Tab Width (filled)" flex="col" h={52} grow={1} justify="center" items="center" rounded={12}>
        <Text name="Text" color="#1C1C1E" weight="medium" lineHeight={20}>Width</Text>
        <Text name="Text" color="#6B6B70" size={12} lineHeight={16}>3.10 m</Text>
      </Frame>
      <Frame name="Tab Height (empty)" flex="col" h={52} grow={1} justify="center" items="center" rounded={12}>
        <Text name="Text" color="#1C1C1E" weight="medium" lineHeight={20}>Height</Text>
        <Text name="Text" color="#6B6B70" size={12} lineHeight={16}>—</Text>
      </Frame>
    </Frame>
    <Frame name="Display (output, aria-live)" flex="row" w="fill" justify="between" items="center">
      <Frame name="Step down −1 cm (44)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:minus" size={20} color="#1C1C1E" />
      </Frame>
      <Frame name="Value" flex="row" gap={6} items="end">
        <Text name="Value digits" color="#1C1C1E" size={40} weight="bold" lineHeight={48}>4.2</Text>
        <Frame name="Caret" w={2} h={40} bg="#1F4E79" />
        <Text name="Unit" color="#6B6B70" size={20} weight={600} lineHeight={32}>m</Text>
      </Frame>
      <Frame name="Step up +1 cm (44)" flex="row" w={44} h={44} justify="center" items="center" bg="#F2F1ED" rounded={999}>
        <Icon name="lucide:plus" size={20} color="#1C1C1E" />
      </Frame>
    </Frame>
    <Text name="Range hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Between 1.00 and 20.00 m</Text>
    <Frame name="Keypad (4x3, gap 8)" flex="col" w="fill" gap={8}>
      <Frame name="Row 1" flex="row" w="fill" gap={8}>
        <Frame name="Key 1" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>1</Text>
        </Frame>
        <Frame name="Key 2" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>2</Text>
        </Frame>
        <Frame name="Key 3" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>3</Text>
        </Frame>
      </Frame>
      <Frame name="Row 2" flex="row" w="fill" gap={8}>
        <Frame name="Key 4" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>4</Text>
        </Frame>
        <Frame name="Key 5" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>5</Text>
        </Frame>
        <Frame name="Key 6" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>6</Text>
        </Frame>
      </Frame>
      <Frame name="Row 3" flex="row" w="fill" gap={8}>
        <Frame name="Key 7" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>7</Text>
        </Frame>
        <Frame name="Key 8" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>8</Text>
        </Frame>
        <Frame name="Key 9" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>9</Text>
        </Frame>
      </Frame>
      <Frame name="Row 4" flex="row" w="fill" gap={8}>
        <Frame name="Key decimal separator (locale: . or ,)" flex="row" h={56} grow={1} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>.</Text>
        </Frame>
        <Frame name="Key 0" flex="row" h={56} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
          <Text name="Text" color="#1C1C1E" size={24} weight={600} lineHeight={32}>0</Text>
        </Frame>
        <Frame name="Key Backspace – 'Delete last digit' (long press clears)" flex="row" h={56} grow={1} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={12}>
          <Icon name="lucide:delete" size={24} color="#1C1C1E" />
        </Frame>
      </Frame>
    </Frame>
    <Frame name="Actions" flex="row" w="fill" gap={12}>
      <Frame name="SecondaryButton Clear" flex="row" w={120} h={52} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
        <Text name="Text" color="#1F4E79" size={16} weight={600} lineHeight={24}>Clear</Text>
      </Frame>
      <Frame name="PrimaryButton Next (→ Width; 'Done' on Height)" flex="row" h={52} grow={1} gap={8} justify="center" items="center" bg="#1F4E79" rounded={999}>
        <Text name="Text" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Next: Width</Text>
        <Icon name="lucide:arrow-right" size={20} color="#FFFFFF" />
      </Frame>
    </Frame>
  </Frame>
</Frame>