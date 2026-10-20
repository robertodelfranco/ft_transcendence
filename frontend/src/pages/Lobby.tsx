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
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-torch">{t("title")}</h1>
      <SocketNotice />
      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <RoomList lobby={lobby} />
        <CreateRoomForm />
      </div>
    </section>
  );
}
