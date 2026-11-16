package com.birathealthcare.dipen.repository;

import com.birathealthcare.dipen.entity.ErpUserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ErpUserRepository extends JpaRepository<ErpUserEntity, String> {

  @Query("SELECT u FROM ErpUserEntity u WHERE LOWER(u.email) = LOWER(:id) OR LOWER(COALESCE(u.aliasEmails, '')) LIKE LOWER(CONCAT('%', :id, '%'))")
  Optional<ErpUserEntity> findByEmailOrAlias(@Param("id") String identifier);

  @Query(value = "SELECT perm_code FROM erp_role_permissions WHERE role_name = :roleName", nativeQuery = true)
  List<String> findPermissionsByRole(@Param("roleName") String roleName);
}
