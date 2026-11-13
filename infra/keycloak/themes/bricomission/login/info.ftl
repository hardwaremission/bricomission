<#import "template.ftl" as layout>
<#--
  Message page, state "info": title "Good to know", the Keycloak info message (plus required
  actions, as in base) and one primary action back to the application. When Keycloak offers an
  action link instead (actionUri), the primary action continues with it.
-->
<@layout.registrationLayout displayMessage=false badge="info"; section>
    <#if section = "header">
        ${msg("bmInfoTitle")}
    <#elseif section = "helper">
        <p id="kc-info-message" class="bm-helper">${message.summary}<#if requiredActions??><#list requiredActions>: <strong><#items as reqActionItem>${kcSanitize(msg("requiredAction.${reqActionItem}"))?no_esc}<#sep>, </#items></strong></#list></#if></p>
    <#elseif section = "form">
        <#if !skipLink??>
            <div class="bm-actions">
                <#if pageRedirectUri?has_content>
                    <a id="backToApplication" class="bm-button bm-button--primary" href="${pageRedirectUri}">${msg("bmBackToApp")}</a>
                <#elseif actionUri?has_content>
                    <a id="bm-proceed" class="bm-button bm-button--primary" href="${actionUri}">${msg("bmContinue")}</a>
                <#elseif client?? && client.baseUrl?has_content>
                    <a id="backToApplication" class="bm-button bm-button--primary" href="${client.baseUrl}">${msg("bmBackToApp")}</a>
                </#if>
            </div>
        </#if>
    </#if>
</@layout.registrationLayout>
