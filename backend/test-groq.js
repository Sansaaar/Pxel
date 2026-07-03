require("dotenv").config();

const groq = require("./providers/groq");

(async()=>{

    try{

        const reply = await groq.generate(

            "llama-3.3-70b-versatile",

            "Say hello in one sentence."

        );

        console.log(reply);

    }catch(err){

        console.error(err);

    }

})();