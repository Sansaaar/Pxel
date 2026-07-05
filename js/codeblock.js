// ==========================================
// Copy Code
// ==========================================

document.addEventListener("click", async e=>{

    const btn =
        e.target.closest(".copy-code");

    if(!btn) return;

    const code =
        btn
        .closest(".code-block")
        .querySelector("code")
        .innerText;

    await navigator.clipboard.writeText(code);

    btn.innerHTML = `

        <i class="fa-solid fa-check"></i>

        Copied

    `;

    setTimeout(()=>{

        btn.innerHTML=`

            <i class="fa-regular fa-copy"></i>

            Copy

        `;

    },2000);

});