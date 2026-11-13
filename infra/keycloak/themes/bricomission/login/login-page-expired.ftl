<#import "template.ftl" as layout>
<#--
  Message page, state "page expired": "Start again" restarts the login flow; "Back to
  BricoMission" only when the client has a base URL.
-->
<@layout.registrationLayout displayMessage=false badge="clock" badgeTone="warning"; section>
    <#if section = "header">
        ${msg("bmExpiredTitle")}
    <#elseif section = "helper">
        <p id="instruction1" class="bm-helper">${msg("bmExpiredMessage")}</p>
    <#elseif section = "form">
        <div class="bm-actions">
            <a id="loginRestartLink" class="bm-button bm-button--primary" href="${url.loginRestartFlowUrl}">${msg("bmStartAgain")}</a>
            <@layout.backLink/>
        </div>
    </#if>
</@layout.registrationLayout>
