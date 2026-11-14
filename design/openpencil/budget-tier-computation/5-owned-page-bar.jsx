<Frame name="5 · Owned project page bar changes (/kitchen-projects/[id])" x={1800} flex="col" w={390} gap={16} p={16} bg="#FFFFFF" shadow="0 -8 32 #0000001F">
  <Text name="Annotation" w="fill" color="#6B6B70" size={12} weight={600} lineHeight={16}>{"NORMATIVE: 'Get my budget' becomes enabled (to /kitchen-projects/[id]/budget); the hint 'Budgets: available soon' is removed. With 1+ succeeded Budget the label becomes 'See my budget'. Helper text: 'Generate a design of your new kitchen or get your budget.' After a Generate claim with intent budget the app lands on /budget?claimed=1&start=1 and starts the first Budget automatically."}</Text>
  <Frame name="Primary 'Generate my kitchen' / 'See my designs'" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
    <Icon name="lucide:sparkles" size={20} color="#FFFFFF" />
    <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Generate my kitchen</Text>
  </Frame>
  <Frame name="Secondary 'Get my budget' (enabled)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
    <Icon name="lucide:receipt-text" size={20} color="#2968EC" />
    <Text name="CTA label" color="#2968EC" size={16} weight={600} lineHeight={24}>Get my budget</Text>
  </Frame>
</Frame>