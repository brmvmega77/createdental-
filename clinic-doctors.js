export function availableClinicDoctors(clinic){
  const hidden=new Set(Array.isArray(clinic?.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]);
  return (Array.isArray(clinic?.doctors)?clinic.doctors:[]).filter(item=>item&&item.active!==false&&!hidden.has(item.id)&&typeof item.id==='string'&&typeof item.name==='string');
}
