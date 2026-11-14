<Frame name="S8 · Kitchen Project – My simulations states (annotation text is normative)" x={450} y={1200} flex="col" w={420} gap={24} p={16} bg="#FAFAF8">
  <Frame name="Empty" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>NO SIMULATIONS YET</Text>
    <Frame name="EmptyCard" flex="col" w="fill" gap={12} items="center" p={16} bg="#FFFFFF" rounded={16} shadow="0 1 3 #0000001A">
      <Icon name="lucide:sparkles" size={24} color="#2968EC" />
      <Text name="Title" color="#182231" size={16} weight={600} lineHeight={24}>No simulations yet</Text>
      <Text name="Helper" w="fill" color="#6B6B70" lineHeight={20}>Generate your first simulation to see your new kitchen from every photo. Primary CTA: Generate my kitchen. The budget button stays disabled.</Text>
    </Frame>
  </Frame>
  <Frame name="Active" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>SIMULATION RUNNING (Open goes to the progress view; Select and Delete disabled; edit entries blocked)</Text>
    <Frame name="SimulationCard active" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" rounded={20} shadow="0 1 3 #0000001A">
      <Frame name="Row" flex="row" w="fill" justify="between" items="center">
        <Text name="Name" color="#182231" size={16} weight={600} lineHeight={24}>Simulation 4</Text>
        <Frame name="Status" flex="row" gap={6} items="center">
          <Icon name="lucide:loader" size={16} color="#2968EC" />
          <Text name="Text" color="#182231" weight={600} lineHeight={20}>Rendering 2 of 6</Text>
        </Frame>
      </Frame>
      <Frame name="Progress track" w="fill" h={6} bg="#E2E0DA" rounded={999}>
        <Frame name="Progress fill" w={110} h={6} bg="#2968EC" rounded={999} />
      </Frame>
    </Frame>
    <Text name="Edit blocked" w="fill" color="#6B6B70" lineHeight={20}>Edit photos, measurements and styles are disabled with the hint: Wait for the simulation to finish to edit your project.</Text>
  </Frame>
  <Frame name="Partial failure" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>PARTIAL FAILURE (not selectable until every Render succeeded)</Text>
    <Frame name="SimulationCard partial" flex="col" w="fill" gap={12} p={16} bg="#FFFFFF" stroke="#B7791F" rounded={20}>
      <Frame name="Row" flex="row" w="fill" justify="between" items="center">
        <Text name="Name" color="#182231" size={16} weight={600} lineHeight={24}>Simulation 1</Text>
        <Frame name="Badge" flex="row" h={28} gap={4} items="center" py={0} px={10} bg="#F2F1ED" rounded={999}>
          <Icon name="lucide:triangle-alert" size={14} color="#B7791F" />
          <Text name="Label" color="#182231" size={12} weight={600} lineHeight={16}>1 photo failed</Text>
        </Frame>
      </Frame>
      <Frame name="Actions" flex="row" w="fill" gap={8}>
        <Frame name="Open (to retry the failed photo)" flex="row" h={44} grow={1} justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
          <Text name="Label" color="#2968EC" weight={600} lineHeight={20}>Open and retry</Text>
        </Frame>
        <Frame name="Select disabled (aria-disabled)" flex="row" h={44} grow={1} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
          <Text name="Label" color="#6B6B70" weight={600} lineHeight={20}>Select</Text>
        </Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame name="Delete confirm" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>DELETE CONFIRM (dialog, focus trapped, Escape closes)</Text>
    <Frame name="Dialog" flex="col" w="fill" gap={16} p={16} bg="#FFFFFF" rounded={20} shadow="0 8 32 #0000001F">
      <Text name="Title" color="#182231" size={18} weight={600} lineHeight={24}>Delete Simulation 2?</Text>
      <Text name="Message" w="fill" color="#6B6B70" lineHeight={20}>Its images and its budget will be removed for good. Your photos and measurements stay.</Text>
      <Frame name="Buttons" flex="col" w="fill" gap={8}>
        <Frame name="Delete (danger)" flex="row" h={52} w="fill" justify="center" items="center" bg="#C0392B" rounded={999}>
          <Text name="Label" color="#FFFFFF" size={16} weight={600} lineHeight={24}>Delete simulation</Text>
        </Frame>
        <Frame name="Cancel" flex="row" h={52} w="fill" justify="center" items="center" bg="#FFFFFF" stroke="#E2E0DA" rounded={999}>
          <Text name="Label" color="#2968EC" size={16} weight={600} lineHeight={24}>Cancel</Text>
        </Frame>
      </Frame>
    </Frame>
    <Text name="Blocked" w="fill" color="#6B6B70" lineHeight={20}>While a simulation is running the Delete button of that card is disabled (the other cards can be deleted). Deleting the selected simulation clears the selection and the budget button returns to its disabled state.</Text>
  </Frame>
  <Frame name="Budget button states" flex="col" w="fill" gap={8}>
    <Text name="Label" color="#6B6B70" size={12} weight={600} lineHeight={16}>BUDGET BUTTON (bottom bar)</Text>
    <Frame name="Disabled" flex="col" w="fill" gap={8}>
      <Text name="Reason" w="fill" color="#6B6B70" lineHeight={20}>Select a simulation to enable your budget.</Text>
      <Frame name="Button disabled" flex="row" h={52} w="fill" gap={8} justify="center" items="center" bg="#F2F1ED" stroke="#E2E0DA" rounded={999}>
        <Icon name="lucide:receipt-text" size={20} color="#6B6B70" />
        <Text name="Label" color="#6B6B70" size={16} weight={600} lineHeight={24}>Get my budget</Text>
      </Frame>
    </Frame>
    <Text name="Variants" w="fill" color="#6B6B70" lineHeight={20}>Selected simulation without a budget: label Get my budget. With a current budget: label See my budget (goes to the budget page). Computing: label See my budget with a loader icon.</Text>
  </Frame>
</Frame>