set fake=c:\green\b_lm_sim_code\models
set real=c:\green\b_lm_model\models

cd ..
mklink /D %fake% %real%
