import { useTranslation } from "react-i18next";
import { usePageTitle } from "../hooks/usePageTitle";
import CreateRoomForm from "../lobby/CreateRoomForm";
import RoomList from "../lobby/RoomList";
import { useLobbyRooms } from "../lobby/useLobbyRooms";
import SocketNotice from "../ws/SocketNotice";

export default function Lobby() {
  const { t } = useTranslation("lobby");
  const lobby = useLobbyRooms();
  usePageTitle("lobby:title");

  return (
    <section className="dungeon-page mx-auto flex w-full max-w-6xl flex-col gap-8">
      <header className="dungeon-heading">
        <span aria-hidden="true" className="dungeon-sigil" />
        <h1>{t("title")}</h1>
      </header>
      <SocketNotice />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RoomList lobby={lobby} />
        <CreateRoomForm />
      </div>
    </section>
  );
}
