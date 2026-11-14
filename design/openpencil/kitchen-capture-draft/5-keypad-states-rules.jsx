<Frame name="5 · Measurement keypad – states and rules" y={1110} flex="col" w={420} gap={20} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Text" w={372} color="#182231" size={16} weight={600} lineHeight={24}>Measurement keypad: replaces the phone keyboard for Length, Width and Height and is the only validator — the page fields never hold an invalid value, so the page has no measurement error state.</Text>
  <Frame name="Opening" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>opening</Text>
    <Text name="Text" w={372} color="#182231" lineHeight={20}>Tapping a measurement field opens the sheet on that field's tab; the field on the page shows the focus ring. The fields never open the phone keyboard. A physical keyboard still types digits, the separator, Backspace, Enter (= Next/Done) and Escape (= Close).</Text>
  </Frame>
  <Frame name="Editing" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>editing and correcting</Text>
    <Text name="Text" w={372} color="#182231" lineHeight={20}>Digits append; the separator key shows the locale's decimal symbol (. or ,) and works once; at most 2 decimals in m. Backspace deletes the last character; long press clears. − / + step by 1 cm (hold to repeat). Clear empties the current field only. Tabs switch fields at any time without losing values.</Text>
  </Frame>
  <Frame name="State out of range" flex="col" w="fill" gap={8}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>live validation: only digits and one separator can be typed (max 2 decimals in m, none in cm); while the value is outside the range the range hint turns into this error row in danger and Next/Done are disabled; − / + clamp to the range</Text>
    <Frame name="Frame" flex="row" w="fill" gap={6} justify="center" items="center">
      <Icon name="lucide:circle-alert" size={16} color="#C0392B" />
      <Text name="Text" color="#C0392B" lineHeight={20}>Between 1.00 m and 20.00 m.</Text>
    </Frame>
  </Frame>
  <Frame name="State cm" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>cm mode (page toggle)</Text>
    <Text name="Text" w={372} color="#182231" lineHeight={20}>Unit "cm", whole numbers: the separator key is disabled (aria-disabled), − / + still step 1 cm, hint "Between 100 and 2000 cm".</Text>
  </Frame>
  <Frame name="Finishing" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>finishing</Text>
    <Text name="Text" w={372} color="#182231" lineHeight={20}>"Next: Width" → "Next: Height" → "Done". Next/Done commit the field (only valid values are committed). Close keeps the fields already committed and discards an invalid edit in progress (the field returns to its last valid value or stays empty). Committed values save as usual ("Saving…" → "Saved") and show on the page with 2 decimals (4.20 m).</Text>
  </Frame>
  <Frame name="A11y" flex="col" w="fill" gap={6}>
    <Text name="Text" w={372} color="#6B6B70" size={12} weight={600} lineHeight={16}>accessibility</Text>
    <Text name="Text" w={372} color="#182231" lineHeight={20}>Dialog with focus trap; keys are buttons (names: digits, "Decimal separator", "Delete last digit", "Decrease by 1 centimetre", "Increase by 1 centimetre"); the display is an output with aria-live; keys ≥ 56 px high.</Text>
  </Frame>
</Frame>