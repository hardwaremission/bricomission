<#import "template.ftl" as layout>
<#--
  Sign in (design frame "Sign in" and state "invalid credentials").
  Invalid credentials show the form-level Alert (not a field error); the username keeps its
  value, the password is emptied and focused. Form id, field names and credentialId follow base.
-->
<#assign bmLoginError = messagesPerField.existsError('username','password')>
<@layout.registrationLayout displayMessage=true displayInfo=false; section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "helper">
        <p class="bm-helper">${msg("bmSignInHelper")}</p>
    <#elseif section = "form">
        <#if realm.password>
            <form id="kc-form-login" class="bm-form" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post" novalidate>
                <#if !usernameHidden??>
                    <div class="bm-field">
                        <label for="username" class="bm-label"><#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if></label>
                        <div class="bm-input-row">
                            <input id="username" class="bm-input" name="username" value="${(login.username!'')}" type="text"
                                   <#if !bmLoginError>autofocus</#if> autocomplete="username" autocapitalize="none" spellcheck="false" dir="ltr"
                                   aria-invalid="<#if bmLoginError>true<#else>false</#if>"<#if bmLoginError> aria-describedby="bm-alert"</#if>/>
                        </div>
                    </div>
                </#if>

                <div class="bm-field">
                    <label for="password" class="bm-label">${msg("password")}</label>
                    <div class="bm-input-row bm-input-row--password" dir="ltr">
                        <input id="password" class="bm-input" name="password" type="password" autocomplete="current-password"
                               <#if bmLoginError || usernameHidden??>autofocus</#if>
                               aria-invalid="<#if bmLoginError>true<#else>false</#if>"<#if bmLoginError> aria-describedby="bm-alert"</#if>/>
                        <@layout.passwordToggle controls="password"/>
                    </div>
                </div>

                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                <button class="bm-button bm-button--primary" name="login" id="kc-login" type="submit">${msg("doLogIn")}</button>
            </form>
        </#if>

        <div class="bm-links">
            <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
                <div id="kc-registration" class="bm-link-row">
                    <span>${msg("noAccount")}</span>
                    <a class="bm-link" href="${url.registrationUrl}">${msg("doRegister")}</a>
                </div>
            </#if>
            <@layout.backLink/>
        </div>
    </#if>
</@layout.registrationLayout>
