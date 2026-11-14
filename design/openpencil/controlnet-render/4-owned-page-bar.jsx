<Frame name="4 · Owned project page – bottom bar change" x={1340} flex="col" w={420} gap={16} p={24} bg="#FFFFFF" stroke="#E2E0DA" rounded={20}>
  <Text name="Title" w="fill" color="#182231" size={16} weight={600} lineHeight={24}>{"/kitchen-projects/<id> bottom bar after this feature (replaces the login-gate-claim \"Available soon\" bar for Generate)"}</Text>
  <Frame name="Bar" flex="col" w="fill" gap={12} pt={12} pr={16} pb={16} pl={16} bg="#FFFFFF" stroke="#E2E0DA" rounded={12}>
    <Frame name="PrimaryCTA 'Generate my kitchen' → /kitchen-projects/<id>/results" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#2968EC" rounded={999}>
      <Icon name="lucide:sparkles" size={20} color="#FFFFFF" />
      <Text name="CTA label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Generate my kitchen</Text>
    </Frame>
    <Frame name="Get my budget – disabled (aria-describedby hint)" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
      <Icon name="lucide:receipt-text" size={20} color="#6B6B70" />
      <Text name="CTA label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Get my budget</Text>
    </Frame>
    <Text name="Hint" w="fill" color="#6B6B70" textAlign="center" lineHeight={20}>Budgets: available soon</Text>
  </Frame>
  <Text name="Rule" w="fill" color="#6B6B70" size={12} lineHeight={16}>With 1+ succeeded render the primary label becomes "See my designs" (→ results). The helper text becomes "Generate a design of your new kitchen. Budgets are coming soon." After the Generate claim (intent render) the app lands on /results and starts the first render automatically with photo 1.</Text>
</Frame>