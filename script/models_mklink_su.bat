set fake=c:\green\b_lm_sim_code\models
set real=c:\fan\b_lm_home\models

cd ..
mklink /D %fake% %real%
