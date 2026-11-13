<#import "template.ftl" as layout>
<#--
  Message page, state "error" (design frame "Message page - error"): fixed friendly title and
  message from the theme files (the technical Keycloak message is not shown), "Start again"
  (restart the login flow) and "Back to BricoMission" when the client has a base URL.
-->
<@layout.registrationLayout displayMessage=false badge="circle-alert" badgeTone="danger"; section>
    <#if section = "header">
        ${msg("bmErrorTitle")}
    <#elseif section = "helper">
        <p id="kc-error-message" class="bm-helper">${msg("bmErrorMessage")}</p>
    <#elseif section = "form">
        <#if !skipLink??>
            <div class="bm-actions">
                <a id="bm-start-again" class="bm-button bm-button--primary" href="${url.loginRestartFlowUrl}">${msg("bmStartAgain")}</a>
                <@layout.backLink/>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
