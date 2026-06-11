import React, { useContext } from "react";
import { Route as RouterRoute, Redirect } from "react-router-dom";

import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";

const Route = ({ component: Component, isPrivate = false, roles = [], ...rest }) => {
  const { isAuth, loading, user } = useContext(AuthContext);

  if (!isAuth && isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/login", state: { from: rest.location } }} />
      </>
    );
  }

  if (isAuth && !isPrivate) {
    return (
      <>
        {loading && <BackdropLoading />}
        <Redirect to={{ pathname: "/tickets", state: { from: rest.location } }} />;
      </>
    );
  }

  // Redirect to /tickets if user doesn't have the required role
  if (isAuth && roles.length > 0 && user?.profile && !roles.includes(user.profile)) {
    return <Redirect to="/tickets" />;
  }

  return (
    <>
      {loading && <BackdropLoading />}
      <RouterRoute {...rest} component={Component} />
    </>
  );
};

export default Route;
